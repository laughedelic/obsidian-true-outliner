# an-indent-writes-one-unit

When indent or outdent moves a node, every line the node owns is written in the destination's
indentation characters, not only its first line, so a tab-indented vault stays tab-indented
below a node's first line.
