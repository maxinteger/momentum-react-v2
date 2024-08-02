import React, { useContext } from 'react';
import {
  TreeIdNodeMap,
  TreeNodeRecord,
  ToggleTreeNode,
  TreeContextValue,
  TreeNavKeyCodes,
  TreeNode,
  TreeNodeId,
} from './Tree.types';

export const TreeContext = React.createContext<TreeContextValue>(null);

/**
 * Get the tree context value.
 * It throws an error if the context is not provided.
 */
export const useTreeContext = (): TreeContextValue => {
  const value = useContext(TreeContext);
  if (!value) {
    throw new Error('useTreeContext hook used without TreeContext!');
  }
  return value;
};

/**
 * Get the root node id of the tree which is represented as a map.
 *
 * @param tree
 */
export const getTreeRootId = (tree: TreeIdNodeMap): TreeNodeId | undefined => {
  return Array.from(tree.values()).find((node) => !node.parent)?.id;
};

/**
 * Find the next active tree node based on the current active node
 * @param tree
 * @param activeNodeId
 * @internal
 */
const findNextTreeNode = (tree: TreeIdNodeMap, activeNodeId: TreeNodeId): TreeNodeId => {
  let current = tree.get(activeNodeId);

  // Step into an open node
  if (!current.isLeaf && current.isOpen) {
    return current.children[0];
  }

  const loopCheck = new Set<TreeNodeId>();

  // Otherwise, find the next sibling
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const parent = tree.get(current.parent);
    const pos = current.index + 1;

    // Reached the last node of the tree
    if (!parent) {
      return activeNodeId;
    } else if (parent.children[pos]) {
      return parent.children[pos];
    } else {
      // If we are at the end of the parent's children, move up one level
      current = parent;
      if (loopCheck.has(current.id)) {
        throw new Error('Infinite loop detected in the tree navigation.');
      } else {
        loopCheck.add(current.id);
      }
    }
  }
};

/**
 * Find the previous active tree node based on the current active node
 *
 * @param tree
 * @param excludeRootNode
 * @param activeNodeId
 * @internal
 */
const findPreviousTreeNode = (
  tree: TreeIdNodeMap,
  excludeRootNode: boolean,
  activeNodeId: TreeNodeId
): TreeNodeId => {
  const current = tree.get(activeNodeId);

  // Already in the root
  if (!current.parent) return activeNodeId;

  // Exclude root
  if (current.index === 0 && excludeRootNode && current.parent === getTreeRootId(tree))
    return activeNodeId;

  // Move one level up
  if (current.index === 0) return current.parent;

  // Find the previous sibling
  let next = tree.get(tree.get(current.parent).children[current.index - 1]);

  const loopCheck = new Set<TreeNodeId>(activeNodeId);

  for (let counter = 0; next; counter++) {
    if (next.isLeaf || !next.isOpen) {
      return next.id;
    }
    // Last child of the open node
    next = tree.get(next.children[next.children.length - 1]);

    if (loopCheck.has(next.id)) {
      throw new Error('Infinite loop detected in the tree navigation.');
    } else {
      loopCheck.add(next.id);
    }
  }
};

/**
 * Open or find the next node based on the current active node
 *
 * @param tree
 * @param activeNodeId
 * @param toggleTreeNode
 * @internal
 */
const openNextNode = (
  tree: TreeIdNodeMap,
  activeNodeId: TreeNodeId,
  toggleTreeNode: ToggleTreeNode
): TreeNodeId => {
  const current = tree.get(activeNodeId);

  if (!current.isLeaf) {
    if (!current.isOpen) {
      // Open it if it's closed
      toggleTreeNode(activeNodeId);
      return activeNodeId;
    } else {
      // Move to the first child if it's open
      return current.children[0];
    }
  }
  // Otherwise, do nothing
  return activeNodeId;
};

/**
 * Close or find the next node based on the current active node
 *
 * @param tree
 * @param activeNodeId
 * @param excludeRoot
 * @param toggleTreeNode
 * @internal
 */
const closeNextNode = (
  tree: TreeIdNodeMap,
  activeNodeId: TreeNodeId,
  excludeRoot: boolean,
  toggleTreeNode: ToggleTreeNode
): TreeNodeId => {
  const current = tree.get(activeNodeId);

  // Close the node if it's open and not a leaf
  if (current.isOpen && !current.isLeaf) {
    toggleTreeNode(activeNodeId);
    return activeNodeId;
  }
  // Do nothing if it's the root
  if (!current.parent || (excludeRoot && current.parent === getTreeRootId(tree))) {
    return activeNodeId;
  }
  // Move up one level if it's closed
  if (current.parent) {
    return current.parent;
  }
  // Otherwise, do nothing
  return activeNodeId;
};

/**
 * Traverse the tree and convert it to a map between the node id and the node
 * It also adds additional information to the node like the parent, the level and the index
 *
 * @param tree
 */
export const convertNestedTree2MappedTree = (tree: TreeNode): TreeIdNodeMap => {
  const map: TreeIdNodeMap = new Map();
  const idSet = new Set<TreeNodeId>();
  const rootNode = {
    node: tree as TreeNode,
    parentId: undefined,
    level: 0,
    index: 0,
    isHidden: false,
  };
  const nodeStack: Array<typeof rootNode> = [rootNode];

  while (nodeStack.length) {
    const { node: parentNode, parentId, level, index, isHidden } = nodeStack.pop();

    if (idSet.has(parentNode.id)) {
      throw new Error(`Duplicate node id found: "${parentNode.id.toString()}".`);
    } else {
      idSet.add(parentNode.id);
    }

    const children = parentNode.children.map((n) => n.id);

    map.set(parentNode.id, {
      id: parentNode.id,
      isOpen: !!parentNode.isOpenByDefault,
      level,
      index,
      children,
      isHidden,
      parent: parentId,
      isLeaf: !children.length,
    });

    parentNode.children?.forEach?.((node, index) =>
      nodeStack.push({
        node,
        index,
        level: level + 1,
        parentId: parentNode.id,
        isHidden: isHidden || !parentNode.isOpenByDefault,
      })
    );
  }

  return map;
};

/**
 * Set the next active tree node based on the key code.
 *
 * @see {@link https://www.w3.org/WAI/ARIA/apg/patterns/treeview/ WCAG Tree Pattern}
 * @see {@link https://www.w3.org/WAI/ARIA/apg/patterns/treeview/examples/treeview-1a/ WCAG Directory Tree example}
 *
 * @param tree
 * @param activeNodeId Current active tree node descriptor
 * @param keyCode Arrow key code
 * @param excludeRoot
 * @param toggleTreeNode
 */
export const getNextActiveNode = (
  tree: TreeIdNodeMap,
  activeNodeId: TreeNodeId,
  keyCode: TreeNavKeyCodes,
  excludeRoot = true,
  toggleTreeNode: ToggleTreeNode
): TreeNodeId => {
  if (!tree.get(activeNodeId)) {
    console.warn(`Tree node not found for id: "${activeNodeId}".`);

    return activeNodeId;
  }

  switch (keyCode) {
    case 'ArrowUp':
      return findPreviousTreeNode(tree, excludeRoot, activeNodeId);
    case 'ArrowDown':
      return findNextTreeNode(tree, activeNodeId);
    case 'ArrowRight':
      return openNextNode(tree, activeNodeId, toggleTreeNode);
    case 'ArrowLeft':
      return closeNextNode(tree, activeNodeId, excludeRoot, toggleTreeNode);
    case 'Enter':
      if (!tree.get(activeNodeId).isLeaf) {
        toggleTreeNode(activeNodeId);
      }
      return activeNodeId;
  }
};

/**
 * Toggle the open/close state of the tree node.
 *
 * It also updates the hidden state of all children based on the parent's open state.
 * And it returns the updated tree without changing the original tree.
 *
 * @param id
 * @param prevTree
 * @param isOpen
 * @internal
 */
export const toggleTreeNodeRecord = (
  id: TreeNodeId,
  prevTree: TreeIdNodeMap,
  isOpen: boolean
): TreeIdNodeMap => {
  const newTree = new Map(prevTree.entries());
  const current = prevTree.get(id);

  if (current.isOpen === isOpen) {
    return prevTree;
  }

  // Set the new isOpen value if it is provided, otherwise toggle it
  newTree.set(id, { ...current, isOpen });

  // Update the hidden state of all children
  mapTree(
    newTree,
    (node, tree) => {
      const parent = tree.get(node.parent);
      newTree.set(node.id, { ...node, isHidden: !parent.isOpen || parent.isHidden });
    },
    { rootNodeId: id }
  );
  return newTree;
};

/**
 * Map each tree node to a new value by calling the callback function.
 *
 * It uses Depth First Search (DFS) with Preorder traverse algorithm.
 *
 * @param tree The tree to traverse
 * @param cb Callback function to process each tree node
 * @param options
 * @param [options.rootNodeId=undefined] The root node id of the tree
 * @param [options.excludeRootNode=true] Include the root node in the result
 */
export const mapTree = <T>(
  tree: TreeIdNodeMap,
  cb: (node: TreeNodeRecord, tree: TreeIdNodeMap) => T,
  options?: {
    rootNodeId?: TreeNodeId;
    excludeRootNode?: boolean;
  }
): Array<T> => {
  // Empty tree, do nothing
  if (tree.size === 0) return;

  // Get the root node id
  const rootNodeId = options?.rootNodeId ?? getTreeRootId(tree);

  if (!tree.has(rootNodeId)) {
    throw new Error(`Tree root node is not found for id: "${rootNodeId.toString()}".`);
  }

  const excludeRoot = options?.excludeRootNode ?? true;
  const result: Array<T> = [];
  const idStack: Array<TreeNodeId> = [rootNodeId];

  while (idStack.length) {
    const nodeId = idStack.shift();
    const node = tree.get(nodeId);

    if (!(excludeRoot && nodeId === rootNodeId)) {
      result.push(cb(node, tree));
    }
    idStack.unshift(...node.children);
  }

  return result;
};
