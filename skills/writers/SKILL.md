---
name: writers
description: 'Use when creating, editing, validating, or troubleshooting Anban custom writer-style YAML files or selecting writer voice guidance for content workflows.'
---

# Custom Writer Styles

Use this skill as the entry point for custom writer YAML guidance. The detailed
schema, examples, lookup order, and troubleshooting notes live in
[references/writer-style-schema.md](references/writer-style-schema.md).

Writer files define writing voice only. They must not carry visual identity or
image style fields; visual style is resolved separately from project/task
configuration.

## Analysis boundary

If a writer file or required source is unavailable, return `skipped` or `data_insufficient` with low confidence and the missing path. Writer guidance is advisory and must not modify a profile, prompt, publish state, or global configuration.
