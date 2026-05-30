# Noted v2

A knowledge graph and note-taking system that helps you organize, connect, and reason about your thoughts and sources.

## Core Concepts

**Notes** are the atomic unit of the system—individual pieces of content you author in Markdown. Each Note has a `kind` (either `thought` for your own reasoning or `source` for external references) and participates in a knowledge graph through **Edges**.

**Edges** are directed relationships between Notes that capture how ideas connect. They can express support, contradictions, elaborations, references, or general relationships, with each edge tracked by its source (user, agent, or import) and status (draft, approved, or rejected).

**Regions** are named groupings of Notes created by you or the agent to cluster related concepts, making large graphs more navigable.

The **Agent Pipeline** runs after each save: it embeds your Note's content using OpenAI's API and infers new Edges to semantically similar Notes using cosine similarity and GPT-4o-mini.

The **Graph View** visualizes your knowledge as a force-directed 2D graph where nodes are Notes and edges show their relationships. You can open any Note from the graph into the **Note Editor** for editing.

## Getting Started

```bash
npm install
npm run dev
```

## Tech Stack

- **React + TypeScript** for the UI
- **Vite** for fast development and builds
- **TipTap** (ProseMirror) for the Note Editor—a WYSIWYG interface that renders blocks inline and serializes to Markdown on save
- **OpenAI API** for embeddings and edge inference

## Development

See `CONTEXT.md` for the complete domain glossary and architectural terms.
