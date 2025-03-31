import type { Metadata } from "next";
import { Geist, Geist_Mono, Nanum_Myeongjo } from "next/font/google";
import "./globals.css";
import Script from 'next/script';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const nanumMyeongjo = Nanum_Myeongjo({
  variable: "--font-nanum-myeongjo",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "킥열닷컴 - 윤석열 대통령 파면 촉구 청원",
  description:
    "헌법재판소에게 윤석열 대통령의 파면을 촉구하는 국민 청원 사이트입니다. 대한민국의 민주주의와 정의를 지키기 위해 여러분의 목소리를 더해주세요.",
  keywords: [
    "윤석열",
    "대통령 파면",
    "헌법재판소",
    "청원",
    "국민 청원",
    "민주주의",
    "정의",
    "킥열닷컴",
    "문형배",
    "이미선",
    "김형두",
    "정정미",
    "정형식",
    "김복형",
    "조한창",
    "정계선",
  ],
  openGraph: {
    title: "킥열닷컴 - 윤석열 대통령 파면 촉구 청원",
    description:
      "헌법재판소에게 윤석열 대통령의 파면을 촉구하는 국민 청원 사이트입니다. 대한민국의 민주주의와 정의를 지키기 위해 여러분의 목소리를 더해주세요.",
    url: "https://kickyeol.com", // 실제 사이트 URL로 변경
    type: "website",
    images: [
      {
        url: "https://kickyeol.com/images/og.png", // OG 이미지 경로
        width: 1200,
        height: 630,
        alt: "윤석열 대통령 파면 촉구 청원",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "킥열닷컴 - 윤석열 대통령 파면 촉구 청원",
    description:
      "헌법재판소에게 윤석열 대통령의 파면을 촉구하는 국민 청원 사이트입니다. 대한민국의 민주주의와 정의를 지키기 위해 여러분의 목소리를 더해주세요.",
    images: ["https://kickyeol.com/images/og.png"], // 트위터 카드 이미지
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-HMFVJM0MDL"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'G-HMFVJM0MDL');
          `}
        </Script>
      </head>
      <body
        className={`${nanumMyeongjo.variable} ${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
