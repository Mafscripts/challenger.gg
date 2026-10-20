import React from "react";
import { Link } from "react-router-dom";
import { Shield } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { topfraggDiscordInviteUrl } from "@/lib/discordCommunity";

const linkClass = "text-cyan underline underline-offset-4 hover:text-foreground";
const ExternalLink = ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>{children}</a>;

const sections = [
  { id: "information", title: "Information we collect", content: <>
    <p>TopFragg operates the competitive gaming platform at topfragg.gg. We process account details such as usernames, emails, profile information and linked accounts; competition entries, results, ratings and rewards; wallet and transaction records; messages, support requests, evidence and moderation records.</p>
    <p>We also process technical information needed to provide and protect the service, such as IP addresses, authentication events and request logs. Information you enter in public profiles, teams, competitions and community chats can be visible to other players.</p>
  </> },
  { id: "youtube", title: "Google and YouTube account data", content: <>
    <p>TopFragg uses YouTube API Services. Connecting YouTube starts only when you choose Connect YouTube in Settings and approve access on Google's consent screen. The connection requests the read-only permission <code className="break-all text-xs text-cyan">https://www.googleapis.com/auth/youtube.readonly</code>.</p>
    <p>During connection, we retrieve your own YouTube channel through the YouTube Data API. We store the selected channel's ID, display name, channel URL, thumbnail URL and connection date alongside your TopFragg account. We use these details to identify your channel, display its link on profiles and competition player cards, prevent duplicate account connections, and check that you have a channel for competitions requiring streaming.</p>
    <p>The current connection does not retrieve your videos, subscriptions, viewing history, private messages or Google email. It does not upload, edit or delete YouTube content. Linking a channel does not continuously check whether you are live.</p>
    <p>The Google access token is used temporarily during the connection callback to retrieve your channel identity. We do not save Google access or refresh tokens in the account database. Your Google password is entered on Google's website and is never requested by TopFragg.</p>
    <p>Our use and transfer of information received from Google APIs follows the <ExternalLink href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</ExternalLink>, including the Limited Use requirements. Google user data is used for the account-linking features described here, not sold, used for advertising targeting, or used to train general-purpose AI models.</p>
    <p>Google processes information under its <ExternalLink href="https://policies.google.com/privacy">Privacy Policy</ExternalLink>. Use of YouTube features is also subject to the <ExternalLink href="https://www.youtube.com/t/terms">YouTube Terms of Service</ExternalLink>.</p>
  </> },
  { id: "connections", title: "Other connections and sharing", content: <>
    <p>You may provide public channel links or connect supported Twitch, Kick or Discord accounts. These providers receive requests needed for the features you choose. Kick connection stores your channel ID, name, URL and connection date; its access token is used during connection and is not saved. Twitch and Discord have separate consent screens and Settings controls.</p>
    <p>We use platform information to operate accounts, organize matches, maintain results and progression, process transactions, provide support and investigate abuse or disputes. Authorized staff can review information needed for these tasks. Hosting, payment and connected service providers process information needed to deliver their services. We may disclose records when required by law or necessary to address fraud, security incidents or legal claims.</p>
    <p>Your linked channel name, URL and profile image may be displayed to other players. Public information can be copied by someone who views it. External sites apply their own privacy policies when you follow their links or load embedded content.</p>
  </> },
  { id: "storage", title: "Storage, security and retention", content: <>
    <p>Account and linked channel information is stored in TopFragg's service database with access restricted to platform services and authorized administrators. We use HTTPS for production connections and access controls to protect accounts. No online service can guarantee complete security.</p>
    <p>Linked channel identity remains stored while the connection is present, until you disconnect it or request deletion. Account, competition, support and financial records have different retention needs. Records needed for payments, tax, disputes, fraud prevention or legal obligations may be retained after an account deletion request; they are not needed to keep a YouTube connection active.</p>
  </> },
  { id: "deletion", title: "Disconnecting and deleting your data", content: <>
    <p>To delete your TopFragg account, open <Link to="/settings#settings-delete-account" className={linkClass}>Settings → Account &amp; security → Delete account</Link>. Confirm your current password and account name. Eligible accounts are deleted immediately. Active competitions and outstanding funds must be settled first; Support can help with these cases. Personal account records and messages you sent are removed, while shared competition and transaction records are anonymized or retained where required for the purposes described above.</p>
    <p>To remove your stored YouTube or Kick connection, open <Link to="/settings#streaming" className={linkClass}>Settings → Connections → Streaming accounts</Link> and choose Disconnect. This deletes the verified channel identity and its matching saved channel link from your account. A separately entered channel link can be removed under Channel links &amp; socials.</p>
    <p>You can also revoke Google's authorization in your <ExternalLink href="https://security.google.com/settings/security/permissions">Google Account permissions</ExternalLink>. Revoking access at Google and deleting data already stored on TopFragg are separate actions: also disconnect on TopFragg or contact support to remove the stored connection. We do not retain Google tokens for ongoing access.</p>
    <p>For access, correction, export or deletion requests, privacy questions or complaints, contact TopFragg Management through a <Link to="/support" className={linkClass}>website support ticket</Link> or the ticket system in our <ExternalLink href={topfraggDiscordInviteUrl}>official Discord community</ExternalLink>. Discord provides a contact route if you cannot sign in to the website. Identify the account and data concerned; do not send passwords or tokens. We may verify account ownership before acting on a request.</p>
  </> },
  { id: "browser", title: "Browser storage and policy updates", content: <>
    <p>TopFragg uses browser storage for sign-in and preferences, and a temporary encrypted cookie for YouTube and Kick connection security. That connection cookie expires after ten minutes and is cleared when the callback is handled. Third-party embeds, such as streaming players, can receive your IP address and use their own cookies or similar technologies when loaded.</p>
    <p>We update this policy when the service or its data practices change. The date above identifies this version. Questions and complaints can be sent through the support routes listed above.</p>
  </> },
];

export default function Privacy() {
  return <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
    <PageHeader eyebrow="Privacy & account data" title="Privacy Policy" description="How TopFragg collects, uses and protects your information, including connected streaming accounts." action={<span className="text-xs text-vapor">Updated October 20, 2026</span>} />
    <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav aria-label="Privacy policy sections" className="glass rounded-xl border border-white/5 p-5 lg:sticky lg:top-24">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold"><Shield className="h-4 w-4 text-cyan" /> Your information</div>
        <ol className="space-y-3">{sections.map((section, index) => <li key={section.id}><a href={`#${section.id}`} className="flex gap-3 text-xs leading-5 text-vapor hover:text-cyan"><span className="font-mono text-cyan">{String(index + 1).padStart(2, "0")}</span>{section.title}</a></li>)}</ol>
        <Link to="/terms" className="mt-5 block border-t border-white/10 pt-4 text-xs text-cyan">Terms of Service →</Link>
      </nav>
      <article className="glass divide-y divide-white/10 rounded-xl border border-white/5 px-5 sm:px-7">
        {sections.map((section, index) => <section key={section.id} id={section.id} className="scroll-mt-24 py-6 sm:py-7">
          <h2 className="mb-4 flex gap-3 text-lg font-bold"><span className="mt-1 font-mono text-xs text-cyan">{String(index + 1).padStart(2, "0")}</span>{section.title}</h2>
          <div className="space-y-3 text-sm leading-7 text-vapor">{section.content}</div>
        </section>)}
      </article>
    </div>
  </main>;
}
