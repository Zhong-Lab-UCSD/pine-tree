# pine-tree <!-- omit in toc -->
Pine Tree, a GIVE Tree implementation with fixed interval, low-resolution summary support.

- [Install](#install)
- [Usage](#usage)

# Install
```bash
npm install @givengine/pine-tree
```

# Usage
You may import the entire namespace of `PineTree`, which includes `PineTree`, and `PineNode`:
```javascript
// Import namespace
const PineTreeNS = require('@givengine/pine-tree')

// Instantiate an Pine tree
var myPineTree = new PineTreeNS.PineTree('chr1:1-100000000')

// Extend your own tree and/or nodes
class MySpecialPineTree extends PineTreeNS.PineTree {
  // Extension code here
}

class MySpecialPineNode extends PineTreeNS.PineNode {
  // Extension code here
}
```

Or you may selectively import part of the module (if you only want to use `PineTree` this may be a better way):
```javascript
// Import tree definition only
const PineTree = require('@givengine/pine-tree').PineTree

// Instantiate an Pine tree
var myPineTree = new PineTree('chr1:1-100000000')
```
