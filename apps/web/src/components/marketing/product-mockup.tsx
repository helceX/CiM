import type { CSSProperties } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  FileText,
  Globe2,
  LayoutDashboard,
  MousePointer2,
  Radar,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
} from "lucide-react";

export type ProductDemoCopy = {
  example: string;
  scroll: string;
  workspace: string;
  brand: string;
  navigation: string[];
  headings: string[];
  labels: string[];
  sources: string[];
  articles: string[];
  summary: string;
  evidence: string;
  profile: string[];
  opportunity: string;
  match: string;
  verify: string;
  report: string;
  reportSections: string[];
  actions: string[];
};

const icons = [Target, Search, Sparkles, Radar, FileText];
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Sanitized illustrative product screens, rendered as sharp native UI at every size. */
export function ProductMockup({
  copy,
  progress = 0,
  hero = false,
}: {
  copy: ProductDemoCopy;
  progress?: number;
  hero?: boolean;
}) {
  const active = Math.min(4, Math.round(progress));
  const flow = clamp(progress / 4);
  const motion = {
    "--product-flow": flow,
    "--product-tilt": `${hero ? -9 : -4 + flow * 4}deg`,
  } as CSSProperties;
  const panel = (i: number): CSSProperties => ({
    opacity: clamp(1 - Math.abs(progress - i) * 0.15),
    transform: `translate3d(${(i - progress) * 105}%, 0, 0) scale(${1 - Math.min(0.08, Math.abs(progress - i) * 0.04)})`,
    visibility: Math.abs(progress - i) >= 1 ? "hidden" : "visible",
  });

  return (
    <div
      className={`product-universe ${hero ? "product-universe-hero" : ""}`}
      style={motion}
      aria-hidden="true"
      data-product-stage={active}
    >
      <div className="product-halo" />
      <div className="product-orbit product-orbit-one" />
      <div className="product-orbit product-orbit-two" />
      <div className="product-float product-float-source">
        <Globe2 />
        <span>{copy.sources[active % copy.sources.length]}</span>
        <i />
      </div>
      <div className="product-float product-float-insight">
        <Sparkles />
        <span>{copy.actions[active]}</span>
      </div>
      <div className="product-device">
        <div className="product-browser">
          <span className="product-traffic">
            <i />
            <i />
            <i />
          </span>
          <span>
            <span className="product-lock">◈</span> mediaory.io
          </span>
          <span>↗</span>
        </div>
        <div className="product-app">
          <aside className="product-sidebar">
            <div className="product-wordmark">
              <img src="/brand/mediaory-mark.png" alt="" width={20} height={18} />{" "}
              Mediaory
            </div>
            <span className="product-workspace">{copy.workspace}</span>
            <div className="product-side-home">
              <LayoutDashboard />
              <span>{copy.navigation[0]}</span>
            </div>
            {icons.map((Icon, i) => (
              <div
                key={i}
                className={
                  active === i ? "product-side-item selected" : "product-side-item"
                }
              >
                <Icon />
                <span>{copy.navigation[i + 1]}</span>
              </div>
            ))}
            <div className="product-avatar">
              <b>M</b>
              <span>{copy.brand}</span>
            </div>
          </aside>
          <div className="product-main">
            <div className="product-topbar">
              <span>
                {copy.brand} <ChevronRight />
              </span>
              <span>
                <Search />
                <span>⌘ K</span>
              </span>
            </div>
            <div className="product-screen-stack">
              <section className="product-screen" style={panel(0)}>
                <div className="product-screen-title">
                  <Target />
                  <h4>{copy.headings[0]}</h4>
                </div>
                <p className="product-small">{copy.labels[0]}</p>
                <div className="product-form-label">{copy.labels[1]}</div>
                <div className="product-input">
                  <span>{copy.brand}</span>
                  <span className="product-caret" />
                </div>
                <div className="product-form-label">{copy.labels[2]}</div>
                <div className="product-tags">
                  <span>
                    {copy.brand} <Check />
                  </span>
                  <span>
                    {copy.profile[0]} <Check />
                  </span>
                </div>
                <div className="product-form-label">{copy.labels[3]}</div>
                <div className="product-source-grid">
                  {copy.sources.slice(0, 4).map((s, i) => (
                    <div
                      key={s}
                      style={{
                        opacity: clamp(1 - i * 0.12 + progress * 0.3),
                        transform: `translateY(${Math.max(0, i * 5 - progress * 20)}px)`,
                      }}
                    >
                      <Globe2 />
                      <span>{s}</span>
                      <Check />
                    </div>
                  ))}
                </div>
                <div className="product-primary">
                  {copy.actions[0]} <ArrowUpRight />
                </div>
              </section>
              <section className="product-screen" style={panel(1)}>
                <div className="product-screen-title">
                  <Search />
                  <h4>{copy.headings[1]}</h4>
                  <span className="product-count">03</span>
                </div>
                <div className="product-filter">
                  <SlidersHorizontal />
                  <span>{copy.labels[4]}</span>
                  <span>{copy.profile[0]}</span>
                  <Check />
                </div>
                <div className="product-feed">
                  {copy.articles.map((article, i) => (
                    <div
                      key={article}
                      className="product-article"
                      style={{
                        transform: `translateY(${(1 - progress) * (24 + i * 18)}px)`,
                      }}
                    >
                      <span className="product-article-icon">
                        <Globe2 />
                      </span>
                      <div>
                        <span className="product-article-meta">
                          {copy.sources[i]} · {copy.labels[5]}
                        </span>
                        <h5>{article}</h5>
                        <span className="product-article-match">
                          {copy.labels[6]} · {copy.brand}
                        </span>
                      </div>
                      <ArrowUpRight />
                    </div>
                  ))}
                </div>
              </section>
              <section className="product-screen" style={panel(2)}>
                <div className="product-screen-title">
                  <Sparkles />
                  <h4>{copy.headings[2]}</h4>
                </div>
                <div className="product-analysis-article">
                  <span className="product-kicker">{copy.sources[0]}</span>
                  <h5>{copy.articles[0]}</h5>
                </div>
                <div className="product-summary">
                  <Sparkles />
                  <div>
                    <b>{copy.labels[7]}</b>
                    <p>{copy.summary}</p>
                  </div>
                </div>
                <div className="product-evidence">
                  <span>
                    <Check />
                    {copy.labels[8]}
                  </span>
                  <p>{copy.evidence}</p>
                  <span>
                    {copy.labels[9]} <ArrowUpRight />
                  </span>
                </div>
              </section>
              <section className="product-screen" style={panel(3)}>
                <div className="product-screen-title">
                  <Radar />
                  <h4>{copy.headings[3]}</h4>
                </div>
                <div className="product-form-label">{copy.labels[10]}</div>
                <div className="product-tags product-profile">
                  {copy.profile.map((p, i) => (
                    <span
                      key={p}
                      style={{ transform: `translateY(${(3 - progress) * i * 8}px)` }}
                    >
                      <Check />
                      {p}
                    </span>
                  ))}
                </div>
                <div className="product-opportunity">
                  <span className="product-kicker">{copy.match}</span>
                  <h5>{copy.opportunity}</h5>
                  <div className="product-match-meter">
                    <i style={{ width: `${clamp(progress - 2) * 100}%` }} />
                  </div>
                  <p>{copy.verify}</p>
                  <span>
                    {copy.labels[9]} <ArrowUpRight />
                  </span>
                </div>
              </section>
              <section className="product-screen" style={panel(4)}>
                <div className="product-screen-title">
                  <FileText />
                  <h4>{copy.headings[4]}</h4>
                </div>
                <div className="product-report">
                  <span className="product-report-brand">
                    MEDIAORY / {copy.labels[11]}
                  </span>
                  <h5>{copy.report}</h5>
                  <div className="product-report-bars">
                    {[40, 68, 48, 85, 62, 95, 78].map((h, i) => (
                      <i
                        key={i}
                        style={{ height: `${h * clamp(progress - 3) * 0.7 + 8}%` }}
                      />
                    ))}
                  </div>
                  {copy.reportSections.map((s, i) => (
                    <div className="product-report-section" key={s}>
                      <span>0{i + 1}</span>
                      <b>{s}</b>
                      <Check />
                    </div>
                  ))}
                </div>
                <div className="product-downloads">
                  <span>
                    PDF <ArrowUpRight />
                  </span>
                  <span>CSV</span>
                  <span>XLSX</span>
                </div>
              </section>
            </div>
            <div className="product-demo-status">
              <span>
                <i />
                {copy.example}
              </span>
              <span>{String(active + 1).padStart(2, "0")} / 05</span>
            </div>
          </div>
          <MousePointer2
            className="product-cursor"
            style={{
              left: `${57 + Math.sin(flow * Math.PI * 2) * 13}%`,
              top: `${44 + flow * 23}%`,
            }}
          />
        </div>
        <div className="product-device-edge" />
      </div>
      <div className="product-scroll-hint">
        <span>↓</span>
        {copy.scroll}
        <span className="product-progress">
          <i style={{ transform: `scaleX(${flow})` }} />
        </span>
      </div>
    </div>
  );
}
