Notes from the severity-first rollout. Written as I went, so the shape is
whatever the week was.

- week one, **discovery**
	- read [the severity RFC](https://example.com/rfc/severity-first) end to end
	  before touching anything, and it was worth it
		- the ordering rule is *stable sort on severity, then recency* — which is
		  not what [[Severity rollout]] does today
	- talked to Maya about the [[People/Maya Okonkwo|alarm-name PII]] question #blocked
		- she wants a written answer before we ship, and [[Severity rollout]] is
		  where it would go
- #request design review, with the mock inline ![the hover mock](Assets/hover-mock.png) as shipped
	- Priya signed it off ![the hover mock](Assets/hover-mock.png) and it goes in [[Severity rollout]]
	- the sourdough note is quoted whole here ![[Sourdough Log]] which [[Severity rollout]] links back to
- week two, ==the sort landed==
	- `sortStable(rows, bySeverity)` replaced the old comparator, ~~and the old
	  one is gone~~ actually it is still there behind the flag
		- see the **flag notes** in [[Severity rollout]]: `--severity-first` is
		  *off* by default, and [the RFC](https://example.com/rfc/severity-first)
		  says why, and the touch fallback is ==still open== #followup
	- 100% of the \*existing\* fixtures still pass, which surprised me

> [!warning] Still open before launch
> The touch fallback is unbuilt. On a phone the timestamp never appears, and
> [[Severity rollout]] promises it does.
> - Priya has the mock, ![the hover mock](Assets/hover-mock.png) as of Tuesday
> - nobody has costed it

| owner | area | state |
| --- | --- | --- |
| Maya | **PII review** | waiting on legal, see [[Severity rollout]] |
| Priya | touch fallback | not started |

```js
// the comparator [[Severity rollout]] documents, for reference
const bySeverity = (a, b) => a.severity - b.severity || b.seen - a.seen;
```

1. first, ship the flag behind `--severity-first`
	1. then delete the old comparator once [[Severity rollout]] is updated
10. tenth, so a two-digit ordinal is in the material too
- [x] **wrote up** the rollout for [[Severity rollout]]
	- [ ] still owe Priya the touch estimate
