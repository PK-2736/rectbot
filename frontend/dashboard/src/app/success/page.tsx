import SuccessContent from './success-content';

export const dynamic = 'force-dynamic';

type SearchParams = {
  [key: string]: string | string[] | undefined;
};

type SuccessPageProps = {
  searchParams?: Promise<SearchParams>;
};

export default async function SuccessPage({ searchParams }: SuccessPageProps) {
  const resolved = await searchParams;
  const raw = resolved?.session_id;
  const sessionId = Array.isArray(raw) ? raw[0] : raw || null;
  return <SuccessContent sessionId={sessionId} />;
}
