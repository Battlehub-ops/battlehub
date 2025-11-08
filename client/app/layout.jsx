export const metadata = {
  title: "BattleHub Admin",
  description: "Manage matches, payouts, and platform stats",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className="bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  );
}

