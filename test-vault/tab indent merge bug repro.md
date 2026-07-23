## Input

paragraph
- list parent1
	- child1
		- grandchild1
	- child2
- list parent2

## Action

1. cursor at the beginning of `list parent1`, press backspace
2. `list parent1` gets merged with the `paragraph`, its children get reparented

## Result

paragraphlist parent1
  - child1
  	- grandchild1
  - child2
- list parent2

(notice broken indentation, children are indented with spaces, grandchild is not even treated as a list element because of mixed whitespace indentation)
## Expected outcome

paragraphlist parent1
- child1
	- grandchild1
- child2
- list parent2