import "./globals.css";
// client/app/layout.js
export const metadata = {
  title: 'BattleHub Admin',
  description: 'Admin dashboard for BattleHub backend',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'sans-serif', background: '#f9fafb' }}>
        {children}
      </body>
    </html>
  );
}

