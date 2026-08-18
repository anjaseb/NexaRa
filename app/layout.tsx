import Script from 'next/script';
import './globals.css';

export const metadata = {
  title: 'NexaRa',
  description: 'Vídeos que duram 24h. Tempo assistido é o que conta.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const adsenseId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

  return (
    <html lang="pt">
      <body>
        {children}
        {/* Só carrega o script do AdSense se a key estiver preenchida.
            Antes da aprovação do Google, isto fica em branco e não
            carrega nada — sem erro, sem anúncio quebrado. */}
        {adsenseId && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseId}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
