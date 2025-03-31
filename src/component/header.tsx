import React from 'react';
import Image from 'next/image';

export default function Header() {
  return (
    <div className="relative w-full h-[320px] sm:h-[520px] lg:h-[640px] max-h-[520px] overflow-hidden]">

      {/* 상단 이미지 (위쪽 절반) */}
      <div className="absolute top-0 left-0 w-full h-1/2 z-0">
        <Image
          src="/images/citizen.jpg"
          alt="Background Image 1"
          layout="fill"
          objectFit="cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/30 to-black" />
      </div>

      {/* 하단 이미지 (아래쪽 절반) */}
      <div className="absolute bottom-0 left-0 w-full h-1/2 z-0">
        <Image
          src="/images/ccourt.jpg"
          alt="Background Image 2"
          layout="fill"
          objectFit="cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-transparent via-black/30 to-black" />
      </div>

      {/* 텍스트 컨텐츠 */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center text-white px-4">
        <h1 className="text-4xl font-bold mb-2" style={{fontFamily: "Nanum Myeongjo", letterSpacing: -.5}}>윤석렬 신속 파면 청원</h1>
        <p className="text-lg max-w-3xl break-keep" style={{fontFamily: "Nanum Myeongjo", letterSpacing: -.5}}>
        헌법이 무너진 그날, 국민은 기억하고 있습니다.
<b className="inline-block">&nbsp;불법 계엄</b>과 <b className="inline-block">국회 탄압</b>은 민주주의의 본질을 위협했습니다. 국회는 헌법의 이름으로 탄핵을 결정했고, 이제 헌법재판소가 그 책임에 응답할 때입니다.
국민의 뜻은 분명합니다.
헌법 위반엔 반드시 책임이 따릅니다.
        </p>
      </div>
    </div>
  );
}
