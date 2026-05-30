# Noted v2 — Domain Glossary

## Terms

### Note
The atomic unit of the system. A single piece of content authored by the user, stored as Markdown (`contentMd`). Has a `kind` (`thought` or `source`), optional embedding, and participates in a knowledge graph via Edges.

### Note Editor
The WYSIWYG interface for composing and editing a Note. Backed by TipTap (ProseMirror). Renders blocks inline and serializes to Markdown on save. Content is stored as Markdown only; TipTap's internal document state is transient.

### Kind
A classification applied to every Note. Either `thought` (the user's own reasoning) or `source` (external reference material). Shown in the editor toolbar and used by the agent pipeline.

### Edge
A directed relationship between two Notes. Has a `type` (supports, contradicts, elaborates, references, relates-to), a `source` (user, agent, import), and a `status` (draft, approved, rejected).

### Region
A named grouping of Notes, created by the agent or the user. Used in the graph view to cluster related notes.

### Agent Pipeline
The background process that runs after each save. Embeds the Note's content via the OpenAI API, then infers Edges to semantically similar Notes using cosine similarity and GPT-4o-mini.

### Graph View
A force-directed 2D graph where each node is a Note and each edge is an Edge. Nodes can be opened from the graph into the Note Editor.
