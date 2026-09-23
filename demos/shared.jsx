import React from 'react';

export function Source({code, file}) {
  return <details className="source"><summary>Read the implementation · {file}</summary>
    <pre><code>{code.trim()}</code></pre></details>;
}

export function Lesson({number, kind, title, question, children}) {
  return <section className="lesson">
    <div className="eyebrow">LESSON {number} <span>· {kind}</span></div>
    <h1>{title}</h1><p className="question">{question}</p>{children}
  </section>;
}
export function spin(ms) {
  const until = performance.now() + ms;
  while (performance.now() < until) { /* Deliberate teaching workload. */ }
}
