// Educational reconstruction: fixed tree; output is a list, not a DOM diff.
// React reuses current/alternate Fibers and records flags for commit.
export function createFiber(name, children = []) {
  const fiber = { name, child: null, sibling: null, return: null };
  // Link down to the first child, across siblings, and back up to the parent.
  children.forEach((child, index) => {
    child.return = fiber;
    if (index === 0) fiber.child = child;
    else children[index - 1].sibling = child;
  });
  return fiber;
}

export function exampleTree() {
  return createFiber('App', [
    createFiber('Input'),
    createFiber('Results', [createFiber('Row A'), createFiber('Row B')]),
  ]);
}

export function createDraft(root) {
  // next points to unfinished work, not the currently published UI.
  return { next: root, output: [], events: [] };
}

export function performUnitOfWork(draft) {
  let unit = draft.next;
  if (!unit) return;
  draft.events.push('begin ' + unit.name);
  draft.output.push(unit.name); // Draft-only calculation.
  // Descend first. A later call resumes from the saved child pointer.
  if (unit.child) {
    draft.next = unit.child;
    return;
  }
  // Completion may walk several ancestors before the next yield checkpoint.
  while (unit) {
    draft.events.push('complete ' + unit.name);
    if (unit.sibling) {
      // The next sibling begins only after this unit has completed.
      draft.next = unit.sibling;
      return;
    }
    unit = unit.return;
  }
  draft.next = null;
}

export function publish(draft) {
  if (draft.next) throw new Error('Finish the draft before publishing.');
  return [...draft.output]; // Our whole-snapshot substitute for React's commit.
}
