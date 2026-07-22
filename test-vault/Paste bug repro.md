## Input

- parent1
	- child1
	- child2
	- parent2
	    - plus one level
		    - plus two levels
			    - 

---

### Action

In the outline mode
1. copy parent1 subtree
2. paste at the _empty node_ under "plus two levels"

## Current result

- parent1
	- child1
	- child2
- parent2
	- plus one level
		- plus two levels
- parent1
	- child1
	- child2

---

## Expected outcome


- parent1
	- child1
	- child2
- parent2
	- plus one level
		- plus two levels
			- parent1
	            - child1
	            - child2