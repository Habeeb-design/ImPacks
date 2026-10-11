import { PackArtwork } from "../../components/PackArtwork";
import { SiteHeader } from "../../components/SiteHeader";
import { LoginClient } from "../../components/LoginClient";
export default function LoginPage() {
 return <main className="login-page"><SiteHeader/><section className="auth-layout"><div className="auth-art"><div className="auth-art-copy"><p className="eyebrow">THE BEST PART? YOU DON’T KNOW YET.</p><h2>A little mystery.<br/>A whole new game.</h2></div><div className="auth-packs"><PackArtwork genre="Sports"/><PackArtwork genre="Crypto"/><PackArtwork genre="Chaos"/></div><p>Three cards. Your next obsession.</p></div><div className="auth-panel"><span className="auth-mark" aria-hidden="true">✦</span><p className="eyebrow">WELCOME TO IMPACKS</p><h1>Your next plot twist<br/>starts here.</h1><p>Sign in. Get your own wallet.<br/>Your packs and testnet AUSD, in one place.</p><LoginClient/><p className="auth-demo-note">Payments and trades are simulated; no real money moves.</p></div></section></main>;
}
