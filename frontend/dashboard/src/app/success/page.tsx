import SuccessContent from './success-content';

type SuccessPageProps = {
  searchParams?: { session_id?: string };
};

export default function SuccessPage({ searchParams }: SuccessPageProps) {
  return <SuccessContent sessionId={searchParams?.session_id || null} />;
}
