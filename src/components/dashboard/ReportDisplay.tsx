interface Props {
  content: string | null;
}

export default function ReportDisplay({ content }: Props) {
  if (!content?.trim()) {
    return (
      <p className="text-sm text-blue-100/70">
        Brak raportu.{" "}
        <a href="/upload" className="text-purple-300 hover:underline">
          Wgraj PDF z badaniami
        </a>
        , aby zacząć.
      </p>
    );
  }

  return (
    <pre className="max-h-[32rem] overflow-auto rounded-lg border border-white/10 bg-black/40 p-4 text-left text-xs leading-relaxed whitespace-pre-wrap text-blue-50">
      {content}
    </pre>
  );
}
