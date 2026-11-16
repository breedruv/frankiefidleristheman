import Link from 'next/link';
import { currentMember } from '../../lib/auth';
import ChangePasswordForm from './ChangePasswordForm';

export default async function ResetPasswordPage() {
  const member = await currentMember();
  return <div className="page"><section className="card login-card"><h1>Set your password</h1>{member ? <><p>Choose a password for your {member} account.</p><ChangePasswordForm /></> : <><p>Open your password reset link to continue.</p><Link href="/login">Return to sign in</Link></>}</section></div>;
}
