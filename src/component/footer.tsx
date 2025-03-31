export default function Footer() {
  return (
    <footer className="w-full bg-gray-200 text-center py-4 min-h-[200px]">
      <br/>
      <h5 className="mb-2">킥열닷컴 운영 원칙</h5>
      <ul className="text-xs text-gray-600 max-w-[80%] mx-auto text-center mb-4">
        <li className="mb-2">본 사이트는 &quot;윤석열 대통령 탄핵 심판 청원&quot;을 목적으로 합니다.</li>
        <li className="mb-2">따라서 이와 정면으로 반대되는 주장(ex. 탄핵 반대, 대통령 지지)은 본 사이트의 운영 목적과 맞지 않아 게시되지 않습니다.</li>
        <li className="mb-2">조롱, 욕설, 도배 등 악의적 표현은 별도 기준으로 차단됩니다.</li>
        <li className="mb-2">그 외 사이트 취지에 부합하지 않는 메시지는 자동 비공개 처리됩니다.</li>
      </ul>
      <h5 className="mb-2">FAQ</h5>
      <p className="text-xs text-gray-600 font-bold">Q. 청원 제출 시 개인 정보를 수집하나요?</p>
      <p className="text-xs text-gray-600 max-w-[80%] mx-auto text-center">A. 청원 시 입력한 정보는 이름, 연령, 위치, IP 주소 등을 포함할 수 있지만, 이 정보들은 서로 분리되어 저장되며, 개인을 식별할 수 없도록 처리됩니다. 따라서 &apos;개인정보&apos;로서 활용되지 않으며, 통계 및 시각자료(인포그래픽) 제공에만 사용됩니다.</p>
      <br/>
      <p className="text-sm text-gray-600">사진 출처: 뉴스타파, 헌법재판소</p>
      <p className="text-sm text-gray-600">문의: support@kickyeol.com</p>
      <br/><br/><br/><br/>
    </footer>
  );
}
