/**
 * File a report. Category → photo → location → description → send.
 *
 * A component rather than a block list: it is one stateful form, and modelling
 * a form as config would be the block architecture used for the sake of it.
 *
 * The photo is captured with `<input type="file" capture="environment">`,
 * which opens the rear camera on a phone and a file picker everywhere else.
 * That is the whole implementation — no getUserMedia, no canvas, no permission
 * dance — and it is the one approach that works identically on iOS Safari,
 * Android Chrome and a laptop, which is what a demo needs.
 *
 * The file is downscaled before it is sent. A modern phone camera produces 3–8
 * MB; nothing on the receiving end needs more than 1600px to judge a pothole,
 * and the API caps the upload at 8 MB anyway. Sending the original would make
 * submit-over-mobile-data the slowest part of the app by an order of
 * magnitude.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Camera,
  Check,
  Image as ImageIcon,
  Loader2,
  MapPin,
  RefreshCcw,
  Send,
  Trash2,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { CATEGORY_EMOJI, CATEGORY_LABEL } from '../../lib/display';
import { reverseGeocode } from '../../lib/geocode';
import { useGeolocation } from '../../lib/useGeolocation';
import { haptic } from '../../lib/haptics';
import { useSession } from '../../store/session';
import type { ReportCategory } from '../../lib/types';

const CATEGORIES: ReportCategory[] = [
  'POTHOLE',
  'WATERLOGGING',
  'DAMAGED_SIGN',
  'STREETLIGHT',
  'GARBAGE',
  'OTHER',
];

/** Long edge, px. Enough to judge a defect, small enough to send on 3G. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Downscale to a JPEG data URI. Falls back to the original file if anything in
 * the canvas path fails — a slightly slow upload beats a lost photo.
 */
async function toDownscaledDataUri(file: File): Promise<string> {
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('could not read the photo'));
    reader.readAsDataURL(file);
  });

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('could not decode the photo'));
      element.src = original;
    });

    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    if (scale === 1 && original.length < 2_000_000) return original;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return original;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } catch {
    return original;
  }
}

export function ReportScreen() {
  const navigate = useNavigate();
  const session = useSession((s) => s.session)!;
  const { state: geo, locate } = useGeolocation();

  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [addressTouched, setAddressTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ask for location as soon as the screen opens. A GPS fix takes seconds, and
  // asking only at submit time is what makes a form feel slow.
  useEffect(() => {
    locate();
  }, [locate]);

  const place = geo.status === 'ok' ? reverseGeocode(geo.lat, geo.lon) : null;

  // Fill the address from the fix, but never overwrite what the user typed.
  // They are standing there; the geocoder is guessing from 26 known segments.
  useEffect(() => {
    if (!addressTouched && place) setAddress(place.address);
  }, [place, addressTouched]);

  async function onPhotoPicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so picking the same file twice still fires a change event.
    event.target.value = '';
    if (!file) return;
    try {
      setPhoto(await toDownscaledDataUri(file));
      haptic('tap');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'could not read the photo');
    }
  }

  const canSubmit = category !== null && geo.status === 'ok' && !submitting;

  async function submit() {
    if (!canSubmit || !category || geo.status !== 'ok') return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createReport({
        category,
        description: description.trim(),
        lat: geo.lat,
        lon: geo.lon,
        address: address.trim(),
        reporter_name: session.displayName,
        ward: place?.ward ?? '',
        photo: photo ?? undefined,
      });
      haptic('confirm');
      navigate(`/citizen/report/sent/${created.report_id}`, { replace: true });
    } catch (cause) {
      haptic('warn');
      setError(
        cause instanceof ApiError
          ? `The city did not accept the report (${cause.status}). ${cause.message.slice(0, 120)}`
          : 'Could not reach the city. Your report was not sent — try again when you have signal.',
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 pb-10 pt-3">
      {/* Both inputs are hidden and driven by the buttons below: a bare file
          input is unstyleable and reads as a broken form control on a phone. */}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPhotoPicked}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPhotoPicked}
      />

      {/* ── 1 · what ─────────────────────────────────────────────────────── */}
      <Section step={1} title="What is the problem?" sub="Pick the closest one.">
        <div className="grid grid-cols-2 gap-2.5">
          {CATEGORIES.map((option) => {
            const selected = option === category;
            return (
              <button
                key={option}
                onClick={() => {
                  haptic('tap');
                  setCategory(option);
                }}
                aria-pressed={selected}
                className={`ut-touch flex flex-col items-center gap-1.5 rounded-[12px] border-2 px-2 py-3.5 text-center transition-colors ${
                  selected ? 'border-accent bg-accent/[0.06]' : 'border-line bg-card'
                }`}
              >
                <span className="text-[26px]">{CATEGORY_EMOJI[option]}</span>
                <span
                  className={`text-[12px] font-medium leading-tight ${selected ? 'text-accent' : ''}`}
                >
                  {CATEGORY_LABEL[option]}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── 2 · photo ────────────────────────────────────────────────────── */}
      <Section
        step={2}
        title="Add a photo"
        sub="Optional, but it is the fastest way to get it fixed."
      >
        {photo ? (
          <>
            <div className="relative overflow-hidden rounded-[14px] border-2 border-emerald bg-ink">
              <img src={photo} alt="The problem you photographed" className="h-44 w-full object-cover" />
              <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-emerald/90 px-2 py-0.5 text-[11px] font-medium text-white">
                <Check size={12} /> Photo added
              </span>
            </div>
            <div className="mt-2.5 flex gap-2.5">
              <button
                onClick={() => cameraInput.current?.click()}
                className="ut-touch flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-line bg-card text-[13px] font-medium"
              >
                <RefreshCcw size={14} /> Retake
              </button>
              <button
                onClick={() => {
                  haptic('tap');
                  setPhoto(null);
                }}
                aria-label="Remove photo"
                className="ut-touch flex items-center justify-center rounded-[10px] bg-danger/10 px-4 text-danger"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => cameraInput.current?.click()}
              className="ut-touch flex items-center justify-center gap-2.5 rounded-[14px] bg-accent px-4 py-3.5 text-[16px] font-medium text-white shadow-[0_4px_14px_rgba(37,99,235,0.3)]"
            >
              <Camera size={20} /> Take a photo
            </button>
            <button
              onClick={() => galleryInput.current?.click()}
              className="ut-touch flex items-center justify-center gap-2 rounded-[14px] border border-line bg-card px-4 py-3 text-[14px] font-medium"
            >
              <ImageIcon size={17} /> Choose from gallery
            </button>
          </div>
        )}
      </Section>

      {/* ── 3 · where ────────────────────────────────────────────────────── */}
      <Section step={3} title="Where is it?" sub="Taken from your phone. Correct it if it is wrong.">
        <div className="ut-card p-3.5">
          <div className="flex items-start gap-2.5">
            <MapPin size={17} className="mt-0.5 flex-none text-accent" />
            <div className="min-w-0 flex-1">
              {geo.status === 'ok' ? (
                <>
                  <div className="font-mono text-[11px] text-ink-soft">
                    {geo.lat.toFixed(5)}, {geo.lon.toFixed(5)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-ink-faint">
                    Accurate to about {Math.round(geo.accuracy_m)} m
                    {place ? ` · ${place.ward}` : ''}
                  </div>
                </>
              ) : geo.status === 'locating' ? (
                <div className="flex items-center gap-2 text-[12px] text-ink-soft">
                  <Loader2 size={13} className="animate-spin" /> Finding your location…
                </div>
              ) : (
                <div className="text-[12px] leading-snug text-ink-soft">
                  {geo.status === 'denied'
                    ? 'Location is blocked for this site. A report needs a location, so allow it in your browser settings and try again.'
                    : geo.status === 'unavailable'
                      ? geo.why
                      : 'Tap “Use GPS” to add your location.'}
                </div>
              )}
            </div>
            <button
              onClick={() => {
                haptic('tap');
                locate();
              }}
              className="ut-touch flex-none rounded-[8px] bg-accent px-2.5 text-[11px] font-medium text-white"
            >
              {geo.status === 'ok' ? 'Update' : 'Use GPS'}
            </button>
          </div>

          <input
            value={address}
            onChange={(event) => {
              setAddress(event.target.value);
              setAddressTouched(true);
            }}
            placeholder="Nearest landmark or street"
            aria-label="Address"
            className="ut-touch mt-3 w-full rounded-[10px] border border-line bg-canvas px-3 py-2.5 text-[14px] outline-none focus:border-accent"
          />
          <p className="mt-1.5 text-[11px] leading-snug text-ink-faint">
            Filled in from the nearest road we know about — it is a landmark, not an exact address.
          </p>
        </div>
      </Section>

      {/* ── 4 · anything else ────────────────────────────────────────────── */}
      <Section step={4} title="Anything to add?" sub="Optional.">
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="e.g. deep hole in the left lane, cars swerving into the bus lane"
          aria-label="Description"
          className="w-full resize-none rounded-[12px] border border-line bg-card px-3.5 py-3 text-[14px] leading-relaxed outline-none focus:border-accent"
        />
      </Section>

      {error ? (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 flex items-start gap-2.5 rounded-[12px] bg-danger/10 px-3.5 py-3"
        >
          <AlertCircle size={15} className="mt-0.5 flex-none text-danger" />
          <p className="text-[12px] leading-relaxed text-danger">{error}</p>
        </motion.div>
      ) : null}

      <button
        onClick={submit}
        disabled={!canSubmit}
        className="ut-touch mt-5 flex w-full items-center justify-center gap-2 rounded-[14px] bg-emerald px-4 py-4 text-[16px] font-medium text-white shadow-[0_4px_16px_rgba(16,185,129,0.35)] disabled:bg-ink-faint disabled:shadow-none"
      >
        {submitting ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Sending…
          </>
        ) : (
          <>
            <Send size={17} /> Send report
          </>
        )}
      </button>

      {/* Says what is missing rather than leaving a disabled button unexplained
          — a greyed-out control with no reason is the most common dead end in
          a mobile form. */}
      {!canSubmit && !submitting ? (
        <p className="mt-2 text-center text-[12px] text-ink-soft">
          {category === null
            ? 'Pick what the problem is to continue.'
            : 'Waiting for your location.'}
        </p>
      ) : null}
    </div>
  );
}

function Section({
  step,
  title,
  sub,
  children,
}: {
  step: number;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <section className={step === 1 ? '' : 'mt-6 border-t border-line pt-5'}>
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/10 text-[11px] font-medium text-accent">
          {step}
        </span>
        <h2 className="text-[16px] font-medium leading-tight">{title}</h2>
      </div>
      <p className="mb-3 ml-7 mt-0.5 text-[12px] leading-snug text-ink-soft">{sub}</p>
      {children}
    </section>
  );
}
