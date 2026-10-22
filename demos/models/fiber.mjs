// Educational reconstruction: fixed tree; output is a list, not a DOM diff.
// React reuses current/alternate Fibers and records flags for commit.
export function createFiber(name, children = []) {
  const fiber = { name, child: null, sibling: null, return: null };
  // child = first child; sibling = next child of the same parent; return = parent.
  // These links let us walk the tree without recursive function calls.
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
    createFiber('Results', [createFiber('Row A'), createFiber('Row B'), createFiber('Row C')]),
    createFiber('Footer'),
  ]);
}

export function createDraft(root) {
  // next is our bookmark: where the next Step will resume. Start at the root.
  return { next: root, output: [], events: [] };
}

export function performUnitOfWork(draft) {
  // Begin the bookmarked node. Adding its name stands in for real render work.
  let unit = draft.next;
  if (!unit) return;
  draft.events.push('begin ' + unit.name);
  draft.output.push(unit.name); // Draft-only calculation.
  // Descend first. A later call resumes from the saved child pointer.
  if (unit.child) {
    draft.next = unit.child;
    return;
  }
  // No child: finish this node, then look sideways or climb back up.
  // One Step can complete several parents (Row C -> Results -> App).
  while (unit) {
    draft.events.push('complete ' + unit.name);
    if (unit.sibling) {
      // The next sibling begins only after this unit has completed.
      draft.next = unit.sibling;
      return;
    }
    unit = unit.return; // No sibling left: finish the parent too.
  }
  // We climbed past the root. The draft is finished, but not published yet.
  draft.next = null;
}

export function publish(draft) {
  if (draft.next) throw new Error('Finish the draft before publishing.');
  return [...draft.output]; // Our whole-snapshot substitute for React's commit.
}
