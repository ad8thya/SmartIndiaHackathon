/**
 * "It's sent." The whole job of this screen is to make a report feel received.
 *
 * The report id is shown big and is the point: it is the thing a citizen can
 * quote if they ever ring the corporation, and the proof that something left
 * the phone. Before T5 there was no id to show, because nothing left the
 * phone.
 */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, ChevronRight, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { CATEGORY_LABEL } from '../../lib/display';
import type { CitizenReport } from '../../lib/types';

const EASE = [0.16, 1, 0.3, 1] as const;

export function ReportSentScreen() {
  const { reportId = '' } = useParams();
  const [report, setReport] = useState<CitizenReport | null>(null);

  useEffect(() => {
    // Best effort. The id in the URL came from a 201, so the report exists —
    // this is only to name the category back. A failure here must not turn a
    // successful submission into an error screen.
    void api
      .report(reportId)
      .then(setReport)
      .catch(() => undefined);
  }, [reportId]);

  return (
    <div className="flex min-h-full flex-col items-center px-5 pb-10 pt-10 text-center">
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.42, ease: EASE }}
        className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-emerald/15 text-emerald"
      >
        <Check size={34} strokeWidth={2.4} />
      </motion.span>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: EASE, delay: 0.1 }}
        className="w-full"
      >
        <h1 className="mt-5 text-[22px] font-medium leading-tight tracking-[-0.4px]">
          Report sent
        </h1>

        <div className="mt-3 inline-block rounded-[10px] bg-accent/[0.08] px-3 py-1.5">
          <div className="text-[10px] font-medium uppercase tracking-[1px] text-ink-muted">
            Report ID
          </div>
          <div className="mt-0.5 font-mono text-[14px] font-medium text-accent">
            {reportId.slice(0, 8).toUpperCase()}
          </div>
        </div>

        <p className="mx-auto mt-4 max-w-[290px] text-[13px] leading-relaxed text-ink-soft">
          {report ? `Your ${CATEGORY_LABEL[report.category].toLowerCase()} report is` : 'It is'} with
          the city now. You will see it move through inspection and repair on the “My reports”
          screen.
        </p>

        <div className="mt-7 flex flex-col gap-2.5">
          <Link
            to="/citizen/reports"
            className="ut-touch flex w-full items-center justify-center gap-1.5 rounded-[12px] bg-accent px-4 py-3.5 text-[15px] font-medium text-white"
          >
            Track it
            <ChevronRight size={16} />
          </Link>
          <Link
            to="/citizen/report"
            className="ut-touch flex w-full items-center justify-center gap-1.5 rounded-[12px] border border-line bg-card px-4 py-3.5 text-[14px] font-medium"
          >
            <Plus size={15} />
            Report another
          </Link>
        </div>

        <p className="mt-6 text-[11px] leading-relaxed text-ink-faint">
          Keep the ID above if you need to follow this up by phone.
        </p>
      </motion.div>
    </div>
  );
}
