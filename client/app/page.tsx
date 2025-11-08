import { redirect } from 'next/navigation';

// server-side redirect from / → /admin
export default function Page() {
  redirect('/admin');
}
