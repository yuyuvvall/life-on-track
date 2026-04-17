# UI Kit Development Skill

## Trigger
Activate this skill whenever editing, creating, or modifying files inside `client/src/`.

---

## File Naming & Structure

Every component lives in its own kebab-case folder under `ui-kit/src/`:

```
parent-folder/
├── {component}/
│   ├── {component}.tsx              # main component (composes sub-components)
│   ├── {component}.stories.tsx      # Storybook stories (only for the main component)
│   ├── {component}-{part}.tsx       # sub-component (e.g., post-header.tsx)
│   ├── {component}-{part}.less      # styles for that sub-component
│   └── index.ts                     # barrel: re-exports main component + its Props type
└── index.ts                         # root barrel: re-exports all components
```

Rules:
- All file names are **kebab-case** (e.g., `post-actions.tsx`, `post-layout.less`)
- Each sub-component has a matching `.less` file next to it
- Story files are only at the **main component level** (`post.stories.tsx`, not `post-header.stories.tsx`)
- One `index.ts` barrel per component folder, one root `src/index.ts` barrel

---

## Controlled Components — MANDATORY

Every component in this library **MUST** be a controlled component:

- **NO `useState`** — the component never owns state
- **NO `useEffect`** — no side effects; the parent drives everything
- **NO `useRef` for state** — refs only for DOM access if absolutely needed
- All data comes through **props**
- All interactions are communicated via **callback props** (`onXxxClick`, `onXxxChange`, etc.)
- Boolean flags like `isLiked`, `isOpen`, `isDisabled` are always props, never internal

Example pattern:
```tsx
// CORRECT — fully controlled
export type ToggleProps = {
  isActive: boolean        // state owned by parent
  onToggle: () => void     // parent handles the state change
}

const Toggle = ({ isActive, onToggle }: ToggleProps) => {
  return <button onClick={onToggle}>{isActive ? 'On' : 'Off'}</button>
}
```

---

## TypeScript — Strict Type Checking

The tsconfig has `"strict": true`. Follow these rules at all times:

- Define props as a **`type`** (not `interface`)
- Export the props type from every component file: `export type XxxProps = { ... }`
- Every prop must be explicitly typed — **no `any`**, no implicit types
- Use `ReactNode` for slot/render props (import from `'react'`)
- Optional props use `?` (e.g., `photoUrl?: string`), never `| undefined`
- Use `satisfies` for Storybook meta objects (see Storybook section)
- All callback props must have explicit function signatures (e.g., `onLikeClick: () => void`)

---

## Component Authoring Pattern

```tsx
import './component-name.less'

export type ComponentNameProps = {
  // typed props here
}

const ComponentName = ({ prop1, prop2 }: ComponentNameProps) => {
  return (
    // JSX here
  )
}

export default ComponentName
```

Rules:
- Use **`const` arrow functions**, not function declarations
- Use **`export default`** for the component
- Destructure props in the function parameter
- **Do NOT use `React.FC`**
- Import the `.less` file at the top of each sub-component

### Composition Pattern
The main component composes sub-components. Layout components accept `ReactNode` slots:

```tsx
// Layout component receives ReactNode slots
export type PostLayoutProps = {
  header: ReactNode
  content: ReactNode
  actions: ReactNode
}

// Main component wires sub-components into layout slots
const Post = (props: PostProps) => {
  return (
    <PostLayout
      header={<PostHeader ... />}
      content={<PostContent ... />}
      actions={<PostActions ... />}
    />
  )
}
```

---

## Export / Barrel Pattern

### Component folder `index.ts`
```ts
export { default as ComponentName } from './component-name'
export type { ComponentNameProps } from './component-name'
```

### Root `src/index.ts`
```ts
export { ComponentName } from './component-name'
export type { ComponentNameProps } from './component-name'
```

- Only export the **main component** and its **Props type** — sub-components stay internal
- Always export the Props type so consumers can use it

---

## Styling — LESS + BEM

- Each sub-component has its own `.less` file
- Use **BEM naming**: `.block__element--modifier`
- Block name matches the component name in kebab-case (e.g., `.post-header`)
- Use LESS `&` nesting for elements and modifiers:

```less
.post-actions {
  display: flex;

  &__button-group {
    display: flex;
  }

  &__icon--liked {
    color: @liked-color;
  }
}
```

- Use **`em` units** for all sizing (not `px`)
- Define color/theme variables as LESS variables at the top of the file (e.g., `@liked-color: #e0245e;`)

---

## Dependencies & Imports

### MUI (Material UI)
- Import individual components: `import Avatar from '@mui/material/Avatar'`
- **Do NOT** import from the root `@mui/material` barrel

### FontAwesome
- Icons: `import { faHeart, faComment } from '@fortawesome/free-solid-svg-icons'`
- Component: `import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'`

### Externals
React, MUI, Emotion, and FontAwesome are all **peer dependencies** — they are externalized in the Vite build and not bundled. Never add these to regular `dependencies`.

---

## Storybook Documentation

Every new main component must have a `.stories.tsx` file. Follow this exact pattern:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import ComponentName from './component-name'

const meta = {
  title: 'ComponentName',
  component: ComponentName,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  args: {
    // shared default callback props using fn()
    onSomeClick: fn(),
  },
} satisfies Meta<typeof ComponentName>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    // all required props with realistic data
  },
}

// Additional stories for variants, states, and edge cases
export const SomeVariant: Story = {
  args: {
    // override specific props
  },
}
```

Rules:
- Use `satisfies Meta<typeof Component>` (not `: Meta<typeof Component>`)
- Wrap all callback props with `fn()` in the `meta.args`
- Always include `tags: ['autodocs']` and `parameters: { layout: 'centered' }`
- Use **realistic data** — real-sounding names, realistic text. NEVER use "John Doe" or other generic AI placeholder names
- Cover these story variants at minimum:
  1. `Default` — all props populated
  2. Without optional props (e.g., `WithoutPhoto`)
  3. Different states (e.g., `Liked` vs default)
  4. Edge cases (e.g., `LongText`, `ManyLikes`)

---

## Checklist Before Finishing

When creating or editing a ui-kit component, verify:

- [ ] Component is fully controlled (no useState/useEffect)
- [ ] Props type is defined and exported
- [ ] All props are explicitly typed (no `any`)
- [ ] File names are kebab-case
- [ ] LESS file uses BEM naming with `em` units
- [ ] Component folder `index.ts` exports the component and its Props type
- [ ] Root `src/index.ts` barrel re-exports the new component
- [ ] Storybook file exists with `autodocs` tag, `satisfies`, `fn()`, and realistic data
- [ ] Build passes: `cd ui-kit && npm run build`
