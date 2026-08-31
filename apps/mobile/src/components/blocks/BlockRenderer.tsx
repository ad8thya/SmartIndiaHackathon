/**
 * One dispatcher for every block kind. See ./types.ts for why screens are
 * block lists at all.
 *
 * The `switch` has no `default`. That is deliberate: with a discriminated
 * union and a `never` check at the end, adding a block kind and forgetting to
 * render it is a compile error rather than a screen that quietly drops a
 * section — which is exactly the failure the untyped design export had.
 *
 * Entry is staggered, 40ms apart, capped. It reads as the list arriving rather
 * than the page flashing, and the cap stops a 40-row queue from taking two
 * seconds to finish appearing.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import {
  TONE_BAR,
  TONE_CHIP,
  TONE_SOLID,
  TONE_STRIPE,
  type Block,
  type BlockAction,
  type InfoCard,
  type Tone,
} from './types';
import { haptic } from '../../lib/haptics';

const EASE = [0.16, 1, 0.3, 1] as const;

export function BlockRenderer({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-3 px-4 pb-8 pt-3">
      {blocks.map((block, index) => (
        <motion.div
          key={block.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          // Capped at 6 steps: a long queue should not take two seconds to
          // finish arriving, and past the sixth row nobody is watching anyway.
          transition={{ duration: 0.28, ease: EASE, delay: Math.min(index, 6) * 0.04 }}
          className="min-w-0"
        >
          <BlockBody block={block} />
        </motion.div>
      ))}
    </div>
  );
}

function BlockBody({ block }: { block: Block }) {
  switch (block.kind) {
    case 'label':
      return (
        <div className="flex items-center gap-2 pt-1">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="text-[11px] font-medium uppercase tracking-[1.1px] text-ink-muted">
            {block.text}
          </span>
        </div>
      );

    case 'hero':
      // The one gradient in the app. It marks the citizen's own space and
      // nothing else; a second one would make it mean nothing.
      return (
        <div className="rounded-action bg-gradient-to-br from-emerald to-[#059669] p-4 text-white shadow-[0_4px_14px_rgba(16,185,129,0.25)]">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px] bg-white/20 text-[20px]">
              {block.emoji}
            </span>
            <div className="min-w-0">
              <div className="text-[16px] font-medium leading-tight">{block.title}</div>
              <div className="mt-0.5 text-[12px] leading-snug opacity-95">{block.sub}</div>
            </div>
          </div>
        </div>
      );

    case 'guide': {
      const tone = block.tone ?? 'accent';
      return (
        <div className={`flex items-center gap-2.5 rounded-[12px] px-3 py-2.5 ${TONE_CHIP[tone]}`}>
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[8px] bg-card shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <block.icon size={15} />
          </span>
          <span className="text-[12px] font-medium leading-snug">{block.text}</span>
        </div>
      );
    }

    case 'hub':
      return (
        <div className="flex flex-col gap-3">
          {block.cards.map((card) => (
            <Link
              key={card.id}
              to={card.to}
              onClick={() => haptic('tap')}
              className="ut-action-card ut-touch flex items-center gap-3.5 border border-line p-4"
              style={{ borderLeftWidth: 6, borderLeftColor: card.accent }}
            >
              <span
                className="flex h-12 w-12 flex-none items-center justify-center rounded-[14px] text-[24px]"
                style={{ backgroundColor: card.tint }}
              >
                {card.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-medium leading-tight">{card.title}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-ink-soft">
                  {card.sub}
                </span>
              </span>
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-ink/[0.05]">
                <ChevronRight size={16} className="text-ink-soft" />
              </span>
            </Link>
          ))}
        </div>
      );

    case 'cards':
      return (
        <div className="flex flex-col gap-2.5">
          {block.items.map((item) => (
            <Card key={item.id} card={item} />
          ))}
        </div>
      );

    case 'kpis':
      return (
        <div className="grid grid-cols-2 gap-2">
          {block.items.map((kpi) => (
            <div key={kpi.id} className="ut-card p-3">
              <div className="text-[11px] leading-snug text-ink-soft">{kpi.label}</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <AnimatedValue value={kpi.value} tone={kpi.tone} />
                {kpi.sub ? (
                  <span className="text-[11px] font-medium text-ink-faint">{kpi.sub}</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      );

    case 'filters':
      return (
        <div className="ut-card flex gap-1 overflow-x-auto p-1">
          {block.items.map((filter) => (
            // The 44px floor is on the BUTTON; the tinted pill inside keeps
            // the design's small size. Growing the pill itself to 44px would
            // make a row of filters look like a row of primary actions —
            // the target has to be big, the chip does not.
            <button
              key={filter.id}
              onClick={() => {
                haptic('tap');
                filter.onClick();
              }}
              className="ut-touch flex flex-none items-center justify-center px-0.5"
            >
              <span
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-[9px] px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                  filter.active ? 'bg-accent text-white' : 'text-ink-soft'
                }`}
              >
                {filter.label}
                {filter.count !== undefined ? (
                  <span
                    className={`rounded px-1 py-px text-[10px] ${
                      filter.active ? 'bg-white/20' : 'bg-ink/[0.06] text-ink-muted'
                    }`}
                  >
                    {filter.count}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      );

    case 'list':
      return (
        <div className="ut-card overflow-hidden">
          {block.rows.map((row) => {
            const body = (
              <>
                {row.icon ? <row.icon size={15} className="flex-none text-ink-faint" /> : null}
                <span className="min-w-0 flex-1 truncate text-[13px]">{row.label}</span>
                {row.value ? (
                  <span
                    className={`flex-none text-[12px] font-medium ${
                      row.tone ? TONE_CHIP[row.tone].split(' ')[1] : 'text-ink-soft'
                    }`}
                  >
                    {row.value}
                  </span>
                ) : null}
                {row.to || row.onClick ? (
                  <ChevronRight size={15} className="flex-none text-ink-faint" />
                ) : null}
              </>
            );
            const shared =
              'ut-touch flex w-full items-center gap-2.5 border-b border-line px-3.5 py-3 last:border-b-0';
            if (row.to) {
              return (
                <Link key={row.id} to={row.to} className={shared} onClick={() => haptic('tap')}>
                  {body}
                </Link>
              );
            }
            if (row.onClick) {
              return (
                <button
                  key={row.id}
                  onClick={() => {
                    haptic('tap');
                    row.onClick?.();
                  }}
                  className={shared}
                >
                  {body}
                </button>
              );
            }
            return (
              <div key={row.id} className={shared}>
                {body}
              </div>
            );
          })}
        </div>
      );

    case 'steps':
      return (
        <div className="ut-card p-4">
          {block.steps.map((step, index) => (
            <div key={step.id} className="flex gap-3">
              {/* The rail: a dot per step, joined by a line that stops at the
                  last one so the timeline does not dangle. */}
              <div className="flex flex-none flex-col items-center">
                <span
                  className={`mt-1 h-2.5 w-2.5 rounded-full ${
                    step.state === 'todo'
                      ? 'bg-line'
                      : step.state === 'current'
                        ? 'bg-accent ring-4 ring-accent/15'
                        : 'bg-emerald'
                  }`}
                />
                {index < block.steps.length - 1 ? (
                  <span
                    className={`w-px flex-1 ${step.state === 'done' ? 'bg-emerald/40' : 'bg-line'}`}
                  />
                ) : null}
              </div>
              <div className={index < block.steps.length - 1 ? 'pb-4' : ''}>
                <div
                  className={`text-[13px] leading-tight ${
                    step.state === 'todo' ? 'text-ink-faint' : 'font-medium'
                  }`}
                >
                  {step.label}
                </div>
                {step.detail ? (
                  <div className="mt-0.5 text-[11px] leading-snug text-ink-soft">{step.detail}</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      );

    case 'note':
      return (
        <div className="flex items-start gap-2.5 rounded-[12px] border border-line bg-card px-3.5 py-3">
          {block.icon ? (
            <block.icon size={15} className="mt-0.5 flex-none text-ink-faint" />
          ) : null}
          <p className="text-[12px] leading-relaxed text-ink-soft">{block.text}</p>
        </div>
      );

    case 'empty':
      return (
        <div className="ut-card flex flex-col items-center px-5 py-9 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-[16px] bg-ink/[0.05] text-ink-muted">
            <block.icon size={24} />
          </span>
          <h2 className="mt-4 text-[16px] font-medium leading-tight">{block.title}</h2>
          <p className="mt-1.5 max-w-[280px] text-[13px] leading-relaxed text-ink-soft">
            {block.sub}
          </p>
          {block.action ? <ActionButton action={block.action} className="mt-5" /> : null}
        </div>
      );

    case 'skeleton':
      // A grey card that pulses, not a spinner. It occupies the space the
      // content will, so the layout does not jump when the data lands.
      return (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: block.rows ?? 3 }).map((_, index) => (
            <div key={index} className="ut-card animate-pulse p-3.5">
              <div className="h-3 w-1/3 rounded bg-ink/[0.07]" />
              <div className="mt-2.5 h-3.5 w-3/4 rounded bg-ink/[0.07]" />
              <div className="mt-2 h-3 w-1/2 rounded bg-ink/[0.05]" />
            </div>
          ))}
        </div>
      );

    case 'custom':
      return <>{block.node}</>;
  }

  // Unreachable while every kind is handled above. If a new kind is added and
  // not rendered, this line stops compiling — which is the point.
  const exhaustive: never = block;
  return exhaustive;
}

function Card({ card }: { card: InfoCard }) {
  const inner = (
    <>
      {card.photoUri ? (
        <div className="relative mb-2.5 h-28 w-full overflow-hidden rounded-[10px] bg-ink">
          <img src={card.photoUri} alt="" className="h-full w-full object-cover" />
          {card.photoBadge ? (
            <span className="absolute left-1.5 top-1.5 rounded bg-emerald/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {card.photoBadge}
            </span>
          ) : null}
        </div>
      ) : null}

      {card.chips?.length || card.meta ? (
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {card.chips?.map((chip) => (
              <span
                key={chip.label}
                className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${TONE_CHIP[chip.tone ?? 'neutral']}`}
              >
                {chip.label}
              </span>
            ))}
          </div>
          {card.meta ? (
            <span className="flex-none text-[11px] text-ink-faint">{card.meta}</span>
          ) : null}
        </div>
      ) : null}

      <div className={card.chips?.length || card.meta ? 'mt-2.5' : ''}>
        <div className="text-[15px] font-medium leading-tight">{card.title}</div>
        {card.sub ? (
          <div className="mt-0.5 text-[12px] leading-snug text-ink-soft">{card.sub}</div>
        ) : null}
      </div>

      {card.progress !== undefined ? (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
            <div
              className={`h-full rounded-full ${TONE_BAR[card.progressTone ?? 'accent']}`}
              style={{ width: `${Math.round(Math.min(1, Math.max(0, card.progress)) * 100)}%` }}
            />
          </div>
          {card.progressLabel ? (
            <span className="flex-none text-[11px] text-ink-soft">{card.progressLabel}</span>
          ) : null}
        </div>
      ) : null}

      {card.details?.length ? (
        <div className="mt-2.5 flex flex-col gap-1.5 border-t border-line pt-2.5">
          {card.details.map((detail) => (
            <div key={detail.text} className="flex items-center gap-2">
              <detail.icon size={13} className="flex-none text-ink-faint" />
              <span className="text-[12px] text-ink-soft">{detail.text}</span>
            </div>
          ))}
        </div>
      ) : null}

      {card.primary || card.secondary ? (
        <div className="mt-3 flex gap-2 border-t border-line pt-3">
          {card.primary ? <ActionButton action={card.primary} className="flex-1" /> : null}
          {card.secondary ? <ActionButton action={card.secondary} variant="ghost" /> : null}
        </div>
      ) : null}
    </>
  );

  const body = (
    <div className="relative overflow-hidden">
      {card.stripe ? (
        <span className={`absolute inset-y-0 left-0 w-1 ${TONE_STRIPE[card.stripe]}`} />
      ) : null}
      <div className={card.stripe ? 'pl-2.5' : ''}>{inner}</div>
    </div>
  );

  if (card.to) {
    return (
      <Link to={card.to} onClick={() => haptic('tap')} className="ut-card block p-3.5">
        {body}
      </Link>
    );
  }
  if (card.onClick) {
    return (
      <button
        onClick={() => {
          haptic('tap');
          card.onClick?.();
        }}
        className="ut-card block w-full p-3.5 text-left"
      >
        {body}
      </button>
    );
  }
  return <div className="ut-card p-3.5">{body}</div>;
}

function ActionButton({
  action,
  variant = 'solid',
  className = '',
}: {
  action: BlockAction;
  variant?: 'solid' | 'ghost';
  className?: string;
}) {
  const classes =
    variant === 'ghost'
      ? 'border border-line bg-card text-ink'
      : TONE_SOLID[action.tone ?? 'accent'];
  const shared = `ut-touch flex items-center justify-center gap-1.5 rounded-[10px] px-3.5 py-2.5 text-[13px] font-medium ${classes} ${className}`;

  if (action.to) {
    return (
      <Link to={action.to} onClick={() => haptic('tap')} className={shared}>
        {action.icon ? <action.icon size={14} /> : null}
        {action.label}
      </Link>
    );
  }
  return (
    <button
      onClick={() => {
        haptic('confirm');
        action.onClick?.();
      }}
      className={shared}
    >
      {action.icon ? <action.icon size={14} /> : null}
      {action.label}
    </button>
  );
}

/**
 * Counts from the previous value to the new one.
 *
 * Not decoration: on a live screen a KPI changes because something happened —
 * an order was assigned, a report came in over the socket — and a number that
 * simply swaps is a change you can miss while looking straight at it. The
 * count draws the eye to the one tile that moved.
 *
 * It animates the *delta*, so the first render (0 → 4) rolls and a later
 * 4 → 5 ticks by one rather than replaying from zero. Reduced motion and a
 * jump of one both skip straight to the value; a counter is exactly the kind
 * of movement `prefers-reduced-motion` exists to suppress.
 */
function AnimatedValue({ value, tone }: { value: string | number; tone?: Tone }) {
  const colour = tone ? TONE_CHIP[tone].split(' ')[1] : '';
  const [shown, setShown] = useState(typeof value === 'number' ? value : 0);
  const previous = useRef(typeof value === 'number' ? value : 0);

  useEffect(() => {
    if (typeof value !== 'number') return;

    const from = previous.current;
    previous.current = value;

    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || Math.abs(value - from) <= 1) {
      setShown(value);
      return;
    }

    // ~420ms regardless of the size of the jump: a counter whose duration
    // scales with the delta takes seconds to settle the first time a busy
    // queue loads.
    const DURATION = 420;
    const start = performance.now();
    let frame = 0;

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      // Same ease-out cubic as every other transition in the app.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  if (typeof value !== 'number') {
    return <span className={`text-[22px] font-medium tabular-nums ${colour}`}>{value}</span>;
  }

  // tabular-nums matters here specifically: without it the tile's width jumps
  // on every frame as the digits change, and the whole row reflows.
  return <span className={`text-[22px] font-medium tabular-nums ${colour}`}>{shown}</span>;
}
