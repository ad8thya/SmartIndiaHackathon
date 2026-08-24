"""CLI for the replay simulator. Owned by M5.

python -m services.tools.replay --speed 60 --buses 6 --loop
"""

from __future__ import annotations

import argparse
import logging
import signal
import sys
import time
from types import FrameType

from .config import get_replay_settings
from .simulator import Simulator, build_publisher

log = logging.getLogger("urban-twin.replay")

_STOP = False


def _handle_signal(signum: int, frame: FrameType | None) -> None:
    global _STOP
    _STOP = True


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m services.tools.replay",
        description="Walk simulated MTC buses along their routes and publish telemetry.",
    )
    parser.add_argument(
        "--speed",
        type=float,
        default=None,
        help=(
            "virtual clock multiplier (default REPLAY_SPEED; "
            "60 = one simulated minute per real second)"
        ),
    )
    parser.add_argument("--buses", type=int, default=None, help="how many buses to simulate (1-6)")
    parser.add_argument(
        "--loop", action="store_true", help="turn around at the terminus and keep going"
    )
    parser.add_argument("--no-loop", dest="loop", action="store_false", help="stop at the terminus")
    parser.add_argument("--tick", type=float, default=None, help="real seconds between ticks")
    parser.add_argument("--ticks", type=int, default=0, help="run N ticks then exit (0 = forever)")
    parser.add_argument("-v", "--verbose", action="store_true", help="log every message")
    parser.set_defaults(loop=None)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)-7s %(name)s │ %(message)s",
    )

    settings = get_replay_settings()
    if args.speed is not None:
        settings = settings.model_copy(update={"REPLAY_SPEED": args.speed})
    if args.loop is not None:
        settings = settings.model_copy(update={"REPLAY_LOOP": args.loop})
    if args.tick is not None:
        settings = settings.model_copy(update={"REPLAY_TICK_SECONDS": args.tick})

    publisher = build_publisher(settings, verbose=args.verbose)
    simulator = Simulator(publisher, settings=settings, bus_count=args.buses)

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    log.info(
        "simulating %d buses at %gx (tick %gs) — Ctrl-C to stop",
        len(simulator.buses),
        settings.REPLAY_SPEED,
        settings.REPLAY_TICK_SECONDS,
    )

    ticks = 0
    last_report = time.monotonic()
    while not _STOP:
        started = time.monotonic()
        simulator.tick(settings.REPLAY_TICK_SECONDS)
        ticks += 1

        if time.monotonic() - last_report >= 10.0:
            stats = simulator.stats()
            log.info(
                "%s │ %d msgs │ %d observations │ %d incidents",
                stats["simulated_time"],
                stats["messages"],
                stats["observations"],
                stats["incidents"],
            )
            last_report = time.monotonic()

        if args.ticks and ticks >= args.ticks:
            break

        # keep real-time pacing even when a tick was slow
        time.sleep(max(0.0, settings.REPLAY_TICK_SECONDS - (time.monotonic() - started)))

    log.info("replay stopped — %s", simulator.stats())
    close = getattr(publisher, "close", None)
    if callable(close):
        close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
