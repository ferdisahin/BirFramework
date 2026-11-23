export const metadata = {
  title: 'Next.js SSR Benchmark',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
