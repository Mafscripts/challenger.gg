import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import AccountPageHero from "@/components/ui/AccountPageHero";
import { topfraggDiscordInviteUrl } from "@/lib/discordCommunity";
import { topfraggCompanyName, topfraggSupportEmail } from "@/lib/supportContact";

export default function PublicSupport() {
  return <div className="account-page competition-surface page-shell" data-competition="support"><div className="page-container">
    <AccountPageHero mode="support" title="TopFragg Support" description="Get help with the iPhone app, your account or a competition." metadata="Account help · Competition support" action={<Link to="/login" className="competition-action-pill account-primary-action">Sign in for tickets<ArrowUpRight size={16} /></Link>} />
    <div className="grid gap-4 md:grid-cols-3">
      <section className="account-panel min-w-0 p-6">
        <Mail className="mb-4 h-7 w-7 text-cyan" aria-hidden="true" />
        <h2 className="text-lg font-bold">Email support</h2>
        <p className="mt-2 text-sm leading-6 text-vapor">Contact our team even if you cannot sign in to your account.</p>
        <a href={`mailto:${topfraggSupportEmail}`} className="mt-4 inline-flex min-h-11 items-center gap-2 break-all text-sm font-bold text-cyan">{topfraggSupportEmail}<ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" /></a>
      </section>
      <section className="account-panel min-w-0 p-6">
        <MessageCircle className="mb-4 h-7 w-7 text-cyan" aria-hidden="true" />
        <h2 className="text-lg font-bold">Community support</h2>
        <p className="mt-2 text-sm leading-6 text-vapor">You can also contact the TopFragg team through the ticket system in our official Discord community.</p>
        <a href={topfraggDiscordInviteUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-cyan">Open Discord<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>
      </section>
      <section className="account-panel min-w-0 p-6">
        <ShieldCheck className="mb-4 h-7 w-7 text-cyan" aria-hidden="true" />
        <h2 className="text-lg font-bold">Account & match tickets</h2>
        <p className="mt-2 text-sm leading-6 text-vapor">Sign in to open a private support ticket, share evidence and follow replies from staff.</p>
        <Link to="/login" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-cyan">Sign in<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
      </section>
    </div>
    <section className="account-panel mt-6 p-6">
      <h2 className="text-lg font-bold">Tell us what happened</h2>
      <p className="mt-2 text-sm leading-7 text-vapor">Include your username, app version, the affected match or ticket ID and a description of the issue. Screenshots can help. Do not send passwords, verification codes or payment details.</p>
      <h3 className="mt-5 font-bold">Account deletion & privacy</h3>
      <p className="mt-2 text-sm leading-7 text-vapor">You can start account deletion in Settings → Account & security → Delete account. If you cannot access your account or need help settling an active competition, email our support team. We may verify account ownership before acting on a request.</p>
      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm text-cyan"><Link to="/privacy">Privacy Policy</Link><Link to="/terms">Terms of Service</Link><Link to="/rules">Competition rules</Link></div>
      <p className="mt-5 text-xs text-vapor">{topfraggCompanyName} · TopFragg</p>
    </section>
  </div></div>;
}
