import net from "node:net";
import tls from "node:tls";
import { once } from "node:events";

const env = (name) => String(process.env[name] || "").trim();

const sanitizeHeader = (value) => String(value || "").replace(/[\r\n]+/g, " ").trim();

const extractAddress = (value) => {
  const header = sanitizeHeader(value);
  const match = header.match(/<([^>]+)>/);
  return (match ? match[1] : header).trim();
};

const normalizeLineEndings = (value) => String(value || "").replace(/\r?\n/g, "\r\n");

const dotStuff = (value) => normalizeLineEndings(value).replace(/^\./gm, "..");

const readResponse = (socket) => new Promise((resolve, reject) => {
  let response = "";

  const cleanup = () => {
    socket.off("data", onData);
    socket.off("error", onError);
    socket.off("close", onClose);
  };

  const onError = (error) => {
    cleanup();
    reject(error);
  };

  const onClose = () => {
    cleanup();
    reject(new Error("SMTP connection closed unexpectedly"));
  };

  const onData = (chunk) => {
    response += chunk.toString("utf8");
    const lines = response.split(/\r?\n/).filter(Boolean);
    const lastLine = lines[lines.length - 1] || "";
    const done = /^\d{3} /.test(lastLine);
    if (!done) return;

    cleanup();
    resolve({
      code: Number(lastLine.slice(0, 3)),
      message: response.trim(),
    });
  };

  socket.on("data", onData);
  socket.once("error", onError);
  socket.once("close", onClose);
});

const connectSocket = async ({ host, port, secure }) => {
  const socket = secure
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });

  socket.setEncoding("utf8");
  socket.setTimeout(Number(process.env.SMTP_TIMEOUT_MS || 10000));

  socket.once("timeout", () => {
    socket.destroy(new Error("SMTP connection timed out"));
  });

  if (secure) {
    await once(socket, "secureConnect");
  } else {
    await once(socket, "connect");
  }

  return socket;
};

const expect = (response, codes, command) => {
  if (codes.includes(response.code)) return response;
  throw new Error(`SMTP ${command} failed: ${response.message}`);
};

const sendCommand = async (socket, command, codes) => {
  socket.write(`${command}\r\n`);
  return expect(await readResponse(socket), codes, command.split(" ")[0]);
};

const upgradeToTls = async (socket, host) => {
  await sendCommand(socket, "STARTTLS", [220]);
  const secureSocket = tls.connect({ socket, servername: host });
  secureSocket.setEncoding("utf8");
  secureSocket.setTimeout(Number(process.env.SMTP_TIMEOUT_MS || 10000));
  secureSocket.once("timeout", () => {
    secureSocket.destroy(new Error("SMTP connection timed out"));
  });
  await once(secureSocket, "secureConnect");
  return secureSocket;
};

const smtpConfig = () => {
  const host = env("SMTP_HOST");
  const from = env("EMAIL_FROM") || env("SMTP_FROM");
  if (!host || !from) return null;

  const secure = env("SMTP_SECURE").toLowerCase() === "true";
  const port = Number(env("SMTP_PORT") || (secure ? 465 : 587));

  return {
    host,
    port,
    secure,
    user: env("SMTP_USER"),
    pass: env("SMTP_PASS"),
    from,
  };
};

export const isEmailConfigured = () => Boolean(smtpConfig());

const buildVerificationMessage = ({ from, to, code }) => {
  const safeFrom = sanitizeHeader(from);
  const safeTo = sanitizeHeader(to);
  const subject = "Your Challenger.gg verification code";
  const boundary = `challenger-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const text = [
    "Your Challenger.gg verification code is:",
    "",
    code,
    "",
    "Enter this code to finish creating your account.",
  ].join("\r\n");
  const html = [
    "<div style=\"font-family:Arial,sans-serif;line-height:1.5;color:#111827\">",
    "<h2>Verify your Challenger.gg account</h2>",
    "<p>Your verification code is:</p>",
    `<p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>`,
    "<p>Enter this code to finish creating your account.</p>",
    "</div>",
  ].join("");

  return [
    `From: ${safeFrom}`,
    `To: ${safeTo}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@challenger.gg>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    html,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
};

export const sendVerificationEmail = async ({ to, code }) => {
  const config = smtpConfig();
  if (!config) {
    return { sent: false, reason: "not_configured" };
  }

  let socket = await connectSocket(config);
  try {
    expect(await readResponse(socket), [220], "CONNECT");
    await sendCommand(socket, "EHLO localhost", [250]);

    if (!config.secure && env("SMTP_STARTTLS").toLowerCase() !== "false") {
      socket = await upgradeToTls(socket, config.host);
      await sendCommand(socket, "EHLO localhost", [250]);
    }

    if (config.user || config.pass) {
      const token = Buffer.from(`\u0000${config.user}\u0000${config.pass}`).toString("base64");
      await sendCommand(socket, `AUTH PLAIN ${token}`, [235]);
    }

    await sendCommand(socket, `MAIL FROM:<${extractAddress(config.from)}>`, [250]);
    await sendCommand(socket, `RCPT TO:<${extractAddress(to)}>`, [250, 251]);
    await sendCommand(socket, "DATA", [354]);
    socket.write(`${dotStuff(buildVerificationMessage({ from: config.from, to, code }))}\r\n.\r\n`);
    expect(await readResponse(socket), [250], "DATA");
    await sendCommand(socket, "QUIT", [221]).catch(() => null);
    return { sent: true, provider: "smtp" };
  } finally {
    socket.destroy();
  }
};
