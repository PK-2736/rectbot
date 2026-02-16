import SuccessContent from './success-content';

type SearchParams = {
  [key: string]: string | string[] | undefined;
};

type SuccessPageProps = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

export default async function SuccessPage({ searchParams }: SuccessPageProps) {
  const resolved = await searchParams;
  const raw = resolved?.session_id;
  const sessionId = Array.isArray(raw) ? raw[0] : raw || null;
  return <SuccessContent sessionId={sessionId} />;
}
