import React, { useState, version } from 'react';
import { createRoot } from 'react-dom/client';
import { SchedulerLesson } from './lessons/scheduler.jsx';
import { FiberLesson } from './lessons/fiber.jsx';
import { QueueLesson } from './lessons/queue.jsx';
import SearchLesson from './lessons/search.jsx';
import SuspenseLesson from './lessons/suspense.jsx';
import './styles.css';

const lessons = [
  ['scheduler', 'Cooperative scheduling', SchedulerLesson],
  ['fiber', 'Fiber & publication', FiberLesson],
  ['queue', 'Lanes & rebasing', QueueLesson],
  ['search', 'Concurrent search', SearchLesson],
  ['suspense', 'Suspense & retry', SuspenseLesson],
];
function App() {
  const [selected, setSelected] = useState(
    lessons.some(([id]) => id === location.hash.slice(1)) ? location.hash.slice(1) : 'scheduler',
  );
  const Lesson = lessons.find(([id]) => id === selected)[2];
  return (
    <div className="shell">
      <aside>
        <a className="brand" href="/">
          CONCURRENT
          <br />
          <strong>React lab.</strong>
        </a>
        <p className="muted">Community call · source to screen</p>
        <nav aria-label="Lessons">
          {lessons.map(([id, label], index) => (
            <button
              key={id}
              aria-current={selected === id ? 'page' : undefined}
              onClick={() => {
                setSelected(id);
                history.replaceState(null, '', '#' + id);
              }}
            >
              <span>0{index + 1}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="environment">
          React {version}
          <br />
          {__BUILD_LABEL__} build
          <br />
          Strict Mode off
        </div>
      </aside>
      <main>
        <Lesson key={selected} />
        <footer>
          Small models explain the mechanism. Real React examples provide the profiling evidence.
        </footer>
      </main>
    </div>
  );
}
// Strict Mode intentionally off for the recorded comparisons; document this setting.
createRoot(document.getElementById('root')).render(<App />);
