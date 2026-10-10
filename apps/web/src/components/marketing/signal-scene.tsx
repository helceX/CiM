import { ArrowUpRight, AudioLines, Check, Orbit, Radar } from "lucide-react";

export type SignalSceneCopy = {
  example: string;
  inputs: string[];
  outputs: string[];
  center: string;
  detail: string;
};

/** A lightweight, illustrative signal flow: no dashboard images or live requests. */
export function SignalScene({
  copy,
  stage = 0,
}: {
  copy: SignalSceneCopy;
  stage?: number;
}) {
  return (
    <div className="mk-signal-scene" data-stage={stage}>
      <div className="mk-signal-topline">
        <span className="mk-chip">{copy.example}</span>
        <span aria-hidden="true">0{stage + 1} / 05</span>
      </div>
      <div className="mk-signal-flow">
        <div className="mk-signal-inputs">
          {copy.inputs.map((text, index) => (
            <div className="mk-signal-note" key={text}>
              <AudioLines aria-hidden="true" />
              <span>{text}</span>
              <span
                className="mk-signal-note-line"
                aria-hidden="true"
                style={{ width: `${70 - index * 12}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mk-signal-core">
          <div className="mk-signal-orbit" aria-hidden="true" />
          <Orbit aria-hidden="true" className="mk-signal-symbol" />
          <span>
            mediaory<span className="mk-gradient-text">.</span>
          </span>
        </div>
        <div className="mk-signal-outputs">
          {copy.outputs.map((text, index) => (
            <div className="mk-signal-result" key={text}>
              {index === stage % copy.outputs.length ? (
                <Radar aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              <span>{text}</span>
              <ArrowUpRight aria-hidden="true" />
            </div>
          ))}
        </div>
      </div>
      <div className="mk-signal-caption" key={copy.center}>
        <span className="mk-gradient-text">{copy.center}</span>
        <p>{copy.detail}</p>
      </div>
      <div className="mk-signal-progress" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((index) => (
          <span key={index} data-active={index <= stage} />
        ))}
      </div>
    </div>
  );
}
