import PetitionForm from '../component/form';
import PetitionCounter from '../component/counter';
import PetitionList from '../component/messages';
import JudgeStats from '../component/stats';
import Header from '../component/header';
import Footer from '@/component/footer';
import RegionHeatmapViewer from '../component/heatmap';
export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100">
      {/* Header를 별도로 감싸고 여백 제거 */}
      <div className="w-full">
        <Header />
      </div>
      <div className="max-w-2xl mx-auto p-4 space-y-20">
        <PetitionForm />
        <PetitionCounter />
        <JudgeStats />
        <PetitionList />
        <RegionHeatmapViewer />
      </div>
      <div className="w-full">
        <Footer />
      </div>
    </main>
  );
}