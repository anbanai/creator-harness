# Upstream source lock

RedFox research adapters are aligned with the public `redfox-data/redfox-community`
repository at revision `d2e24f02340a440a73a96aa6ad6a65f681fba89f`.

| Anban mode | Upstream reference | Boundary |
| --- | --- | --- |
| Cross-platform hot topics | `skills/trending-hub-top10/SKILL.md` | Read-only hotspot aggregation |
| WeChat article search | `skills/gzh-search/SKILL.md` and `skills/wechat-search/SKILL.md` | Public article discovery only |
| Xiaohongshu search | `skills/xiaohongshu-search/SKILL.md` | Public note discovery only |
| Douyin search and daily ranking | `skills/douyin-search/SKILL.md` and `skills/douyin-daily-hot/SKILL.md` | Public work/ranking discovery only |

The upstream scripts are method references. Anban Agents use the registered
RedFox runtime capability and the file-backed evidence contract in the parent
Skill; they do not copy upstream HTTP clients or payment/account workflows.
When the upstream revision changes, update this lock and review the boundary
before changing the adapter.
