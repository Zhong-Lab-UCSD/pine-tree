/**
 * @license
 * Copyright 2017-2018 Xiaoyi Cao
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @module PineNode
 */

const GiveTreeNS = require('@givengine/give-tree')
const ChromRegion = require('@givengine/chrom-region')

const log4js = require('@log4js-node/log4js-api')
const logger = log4js.getLogger('givengine')

/**
 * Non-leaf nodes for Pine Trees
 * This is an interface for all nodes that belongs to an pine tree, which
 * provides summary, caching and withering functions, but is not
 * self-balanced.
 *
 * See `GiveNonLeafNode` for common non-leaf node documentation.
 *
 * @property {boolean} isRoot
 * @property {Array<number>} keys
 * @property {Array<GiveTreeNode|null|boolean>} values
 * @property {number} reverseDepth
 * @property {GiveTree} tree - Link to the `GiveTree` object to access tree-
 *    wise properties.
 * @property {number} tree.scalingFactor - The scaling factor for the pine
 *    tree.
 *    This is the factor for non-leaf nodes (this will be used to initialize
 *    `this.tree.leafScalingFactor` if the latter is not initialized.).
 * @property {number} tree.leafScalingFactor - The scaling factor for the
 *    leaf nodes of the pine tree.
 *    For example, if `this.tree.leafScalingFactor === 100`, each leaf node
 *    (`DataNode`) shall cover 100bp.
 * @property {function|null} tree._SummaryCtor - The constructor for a data
 *    summary.
 * @property {Object|null} _summary - The data summary for this node.
 *
 * @class
 * @alias module:PineNode
 *
 * @param {Object} props
 * @param {GiveTree} props.tree - for `this.tree`
 * @param {boolean} props.isRoot
 * @param {number} [props.start]
 * @param {number} [props.end]
 * @param {number} [props.reverseDepth]
 * @param {Array<number>} [props.keys] - for `this.keys`
 * @param {Array<GiveTreeNode>} [props.values] - for `this.values`
 */
class PineNode extends GiveTreeNS.GiveNonLeafNode {
  constructor (props) {
    super(...arguments)

    // Note that `this.reverseDepth` should be depending on both scaling
    //    factors.
    if (this.end - this.start <= this.tree.leafScalingFactor) {
      this.reverseDepth = 0
    } else {
      this.reverseDepth = Math.ceil(
        (Math.log(this.end - this.start) -
          Math.log(this.tree.leafScalingFactor)
        ) / Math.log(this.tree.scalingFactor))
    }

    this._summary = null
  }

  get hasData () {
    return this.summary !== null
  }

  /**
   * Whether the data of the child node is there
   *
   * @param  {number} index - index of the child node
   * @returns {boolean} - `true` if the data is ready, `false` if not.
   */
  childHasData (index) {
    return this.values[index] === false ||
      (this.values[index] !== null && this.values[index].hasData)
  }

  /**
   * Get the resolution of any data node given the
   *    reversed depth of the node.
   *
   * @param {number} revDepth - the reversed depth of the node.
   * @returns {number}  Return the resolution (span of the node),
   *    1 is the smallest (finest)
   */
  _getResolutionAtDepth (revDepth) {
    return parseInt(Math.floor(this.tree.scalingFactor ** revDepth *
      this.tree.leafScalingFactor))
  }

  /**
   * Get the resolution of this data node (span of the node),
   *    `1` is the smallest (finest).
   *
   * @type {number}
   */
  get resolution () {
    return this._getResolutionAtDepth(this.reverseDepth)
  }

  /**
   * Get the resolution of a child data node
   *
   * @param  {number} [index] - index of the child node, if not provided, then
   *    return the supposed child resolution (because it should be fixed in
   *    pine trees.)
   * @returns {number} - resolution of the child
   */
  getChildResolution (index) {
    // if index is a number, then it's asking for the resolution of that
    //   specific child, otherwise it's a generalized child resolution
    if (!isNaN(index) && parseInt(index) === index) {
      // Specialized child resolution
      if (this.reverseDepth <= 0 || this.values[index] === false) {
        return 1
      } else if (this.values[index] && this.values[index].resolution) {
        return this.values[index].resolution
      }
    }
    // Generalized child resolution
    return this.reverseDepth > 0
      ? this._getResolutionAtDepth(this.reverseDepth - 1)
      : 1
  }

  /**
   * Get whether the resolution of this data node is enough
   *    for the given resolution requirement.
   *
   * @param  {number} [resolution] - the resolution required, if not provided,
   *    use `1` (the finest) instead
   * @returns {boolean}  Return `true` if the resolution is enough,
   *    otherwise `false`.
   */
  resolutionEnough (resolution) {
    resolution = (typeof resolution === 'number' && !isNaN(resolution))
      ? resolution : 1
    return this.resolution <= resolution
  }

  /**
   * Get whether the resolution of a child is enough
   *    for the given resolution requirement.
   *
   * @param  {number} [resolution] - the resolution required, if not provided,
   *    use `1` (the finest) instead for the required resolution.
   * @param  {number} [index] - index of the child node, if not provided, then
   *    return the supposed child resolution (because it should be fixed in
   *    pine trees.)
   * @returns {boolean}  Return `true` if the resolution is enough,
   *    otherwise `false`.
   */
  childResolutionEnough (resolution, index) {
    resolution = (typeof resolution === 'number' && !isNaN(resolution))
      ? resolution : 1
    return this.getChildResolution(index) <= resolution
  }

  /**
   * Get the closest resolution that is adequate for the
   *    required resolution.
   *
   * @param {number} requiredRes - the required resolution.
   * @returns {number}  Return the closest resolution that is smaller or equal
   *    to `requiredRes`.
   */
  _getClosestResolution (requiredRes) {
    if (requiredRes >= this.tree.leafScalingFactor) {
      return parseInt(Math.floor(this.tree.scalingFactor **
        Math.floor((Math.log(requiredRes / this.tree.leafScalingFactor)) /
          Math.log(this.tree.scalingFactor)) * this.tree.leafScalingFactor
      ))
    }
    return 1
  }

  /**
   * Fit coordinates to resolution requirements.
   *
   *    This is mainly used in cases when a value is put into a series of
   *    consecutive bins of `resolution` size, and we need to find the
   *    boundary of the bin. For example, if we put 12 into bins of 10, then
   *    we'll need either 10 or 20, depending on whether we need the lower
   *    boundary or the upper one.
   *
   * @static
   * @param  {number} value - value to be fitted
   * @param  {number} resolution - resolution that needs to be fitted, *i.e.*
   *    bin size.
   * @param  {function} [roundingFunc] - rounding function used when fitting
   *    the bin. Use `Math.ceil` to get upper bounds, and `Math.floor` for
   *    lower bounds. Other rounding methods can be used to achieve different
   *    purposes (getting the midpoint of the bin, for example).
   *    `Math.floor` is used by default.
   * @returns {number} returns the fitted value
   */
  static fitResolution (value, resolution, roundingFunc) {
    // use roundingFunc to fit value to the closest resolution
    // roundingFunc can be Math.floor, Math.ceil or Math.round
    roundingFunc = roundingFunc || Math.round
    return parseInt(roundingFunc(value / resolution) * resolution)
  }

  /**
   * Update the summary data within this node
   *
   * @param  {ChromRegion} [chromEntry] - if known summaries exist in the
   *    data entry, replace current summary with the new one.
   * @returns {boolean} - return `true` if summary has been updated.
   */
  updateSummary (chromEntry) {
    if (typeof this.tree._SummaryCtor === 'function') {
      let newSummary
      if (chromEntry) {
        newSummary = this.tree._SummaryCtor.extract(chromEntry)
      }
      if (newSummary instanceof this.tree._SummaryCtor) {
        // summary provided, just replace
        this._summary = newSummary
        this._summaryChromRegion = chromEntry
      } else if (!this.summary) {
        if (newSummary) {
          // newSummary is something with wrong type
          logger.info(newSummary + ' is not a correct summary ' +
            'type. Will be regenerated from tree data.')
        }
        newSummary = new this.tree._SummaryCtor()
        if (this.values.every((nodeEntry, index) => {
          if (nodeEntry === false) {
            // Child is zero, just return true
            return true
          }
          if (nodeEntry === null ||
            (this.reverseDepth > 0 && nodeEntry.summary === null)) {
            return false
          }
          if (this.reverseDepth > 0) {
            newSummary.addSummary(this, nodeEntry.summary)
          } else {
            nodeEntry.traverse(null, chromEntryInDataNode =>
              newSummary.addDataFromChromEntry(this, chromEntryInDataNode),
            null, false, { notFirstCall: true })
          }
          return true
        })) {
          this._summary = newSummary
          this._summaryChromRegion = this.summary.attach(
            new ChromRegion({
              chr: this.tree.chr,
              start: this.start,
              end: this.end
            })
          )
        } else {
          this._summary = this._summary || null
          delete this._summaryChromRegion
        }
      }
    }
    return true
  }

  /**
   * The summary data of `this`, or `null`
   *
   * @type {_SummaryCtor|null}
   */
  get summary () {
    return this._summary
  }

  /**
   * Get a `ChromRegion` object including the summary
   *    data of `this` as its `._summary` property.
   *
   * @returns {ChromRegion|null}  the `ChromRegion` object, or `null`
   */
  get summaryChromRegion () {
    return this._summaryChromRegion || null
  }

  /**
   * Insert data under this node
   *
   * @param {Array<ChromRegion>} data - the sorted array of data
   *    entries (each should be an extension of `ChromRegion`).
   *    `data === null` or `data === []` means there is no data in
   *    `chrRange` and `false`s will be used in actual storage.
   *
   *    __NOTICE:__ any data overlapping `chrRange` should appear either
   *    here or in `continuedList`, otherwise `continuedList` in data
   *    entries may not work properly.
   *
   *    After insertion, any entry within `data` that overlaps `chrRange`
   *    will be deleted from the array.
   * @param {ChromRegion} chrRange - the chromosomal range that
   *    `data` corresponds to.
   *
   *    This is used to mark the empty regions correctly. No `null` will
   *    present within these regions after this operation.
   *
   *    This parameter should be a `ChromRegion` object.
   * @param {number} [chrRange.resolution] - the resolution provided for the
   *    insertion. 1 is finest. This is used in case of mixed resolutions
   *    for different `chrRange`s, This will override `props.resolution` if
   *    both exist.
   * @param {Object} [props] - additional properties being passed onto
   *    nodes.
   * @param {Array<ChromRegion>} [props.continuedList] - the list of data
   *    entries that should not start in `chrRange` but are passed from the
   *    earlier regions, this will be useful for later regions if date for
   *    multiple regions are inserted at the same time
   * @param {function} [props.callback] - the callback function to be
   *    used (with the data entry as its sole parameter) when inserting
   * @param {number} [props.resolution] - the resolution provided for the
   *    insertion. 1 is finest. This will be overridden by
   *    `chrRange.resolution` if both exist.
   * @param {function} [props.LeafNodeCtor] - the constructor function of
   *    leaf nodes if they are not the same as the non-leaf nodes.
   * @returns {GiveNonLeafNode|boolean}
   *    This shall reflect whether auto-balancing is supported for the tree.
   *    See `GiveNonLeafNode.prototype.restructure` for details.
   */
  insert (data, chrRange, props) {
    props = props || {}
    if (data && data.length === 1 && !chrRange) {
      chrRange = data[0]
    }

    if (data && !Array.isArray(data)) {
      throw (new Error('Data is not an array! ' +
        'This will cause problems in continuedList.'))
    }

    if (chrRange) {
      let resolution = chrRange.resolution || props.resolution || 1
      // clip chrRegion first (should never happen)
      chrRange = this.truncateChrRange(chrRange, true, true)
      // First, if this 'insertion' is just updating the summary data of
      //    self, just update.
      // Then, there are three cases for insertion:
      // 1. leaf nodes: use `DataNode` to store raw data
      // 2. non-leaf nodes:
      //    go deep to generate branch structure, or update summary
      //    (for trees that support summary and resolutions)
      if (this.resolutionEnough(resolution)) {
        // check whether the data summary matches the node boundary
        // because data retrieval may be out of sync, redundant data will need
        //    to be discarded
        while (data.length && this.start > data[0].start) {
          data.splice(0, 1)
        }
        if (data.length) {
          if (this.start !== data[0].start || this.end !== data[0].end) {
            if (!(this.hasData)) {
              if (this.end <= data[0].start) {
                this.updateSummary(new this.tree._SummaryCtor())
              } else {
                throw new Error('Summary range does not match! ' +
                  '`this`: ' + this.start + ' - ' + this.end + '; data: ' +
                  data[0].start + ' - ' + data[0].end
                )
              }
            }
          } else {
            // ***** This should fit Summary definition *****
            this.updateSummary(data[0])
            if (typeof props.callback === 'function') {
              props.callback(data[0])
            }
            data.splice(0, 1)
          }
        }
      } else if (this.reverseDepth > 0) {
        // case 2
        this._addNonLeafRecords(data, chrRange, props)
      } else {
        // case 1
        this._addLeafRecords(data, chrRange, props)
      }
      this.updateSummary()
    } else { // chrRange
      throw (new Error(chrRange + ' is not a valid chrRegion.'))
    } // end if(chrRange)
    return this.restructure()
  }

  _addNonLeafRecords (data, chrRange, props) {
    // This function adds record(s), and structures of the tree

    // In leaf nodes, the actual record trunks may need to be split before
    //    range just to keep the loaded status correct.

    // Find the range of child that rangeStart is in
    let currIndex = 0
    let childRes = this.getChildResolution()
    let childRange = chrRange.clone()

    // Steps:
    // 1. Find the range where the first child node should be inserted.
    //    This should be the node where `chrRange.start` falls in.
    // 2. Split children if possible to create the dedicated range for the
    //    child.
    // 3. Check if the child node contains actual data (by checking
    //    `data[currDataIndex]`).
    //    If yes, create a non-leaf node on the dedicated range and call
    //    `child.insert` on the dedicated range, `data` and `props`;
    //    otherwise, use `false` to fill the dedicated range and merge with
    //    previous `false`s if possible.

    while (chrRange.start < chrRange.end) {
      // 1. Find the range where the first child node should be inserted.
      //    This should be the node where `chrRange.start` falls in.
      let newRangeStart = this.constructor.fitResolution(
        chrRange.start, childRes, Math.floor
      )
      let newRangeEnd = Math.min(this.end,
        this.constructor.fitResolution(chrRange.end, childRes, Math.ceil),
        newRangeStart + childRes
      )
      childRange.end = newRangeEnd
      childRange.start = newRangeStart

      while (this.keys[currIndex + 1] <= childRange.start) {
        currIndex++
      }

      // 2. Split children if possible to create the dedicated range for the
      //    child.
      if (this.keys[currIndex] < childRange.start) {
        // If there are spaces before the dedicated range
        this._splitChild(currIndex++, childRange.start)
      }

      if (this.keys[currIndex + 1] > childRange.end) {
        // If there are spaces after the dedicated range
        this._splitChild(currIndex, childRange.end)
      }

      // Now the dedicated range is ready

      // 3. Check if the child node contains actual data (by checking
      //    `data[currDataIndex]`), or the (probably empty) data range falls
      //    within child range.
      //    otherwise, use `false` to fill the dedicated range and merge with
      //    previous `false`s if possible.
      //    Note that if `props.continuedList` has stuff, this should be considered
      //    as CONTAIN data, so it should still goes all the way down to
      //    `DataNode`
      let fixChildFlag = false

      if ((data[0] && data[0].start < childRange.end) ||
        (Array.isArray(props.continuedList) &&
          props.continuedList.some(entry => entry.end > childRange.start)) ||
        (chrRange.start > childRange.start || chrRange.end < childRange.end)
      ) {
        // If yes, create a non-leaf node on the dedicated range and call
        // `child.insert` on the dedicated range, `data` and `props`;
        if (!this.values[currIndex]) {
          // try to establish previous nodes
          this.values[currIndex] = new PineNode({
            isRoot: false,
            start: childRange.start,
            end: childRange.end,
            reverseDepth: this.reverseDepth - 1,
            tree: this.tree
          })
        }
        fixChildFlag = !this.values[currIndex].insert(data, chrRange, props)
      } else {
        fixChildFlag = true
      }

      if (fixChildFlag) {
        // otherwise, use `false` to fill the dedicated range and merge with
        // previous `false`s if possible.
        this.values[currIndex] = false
        if (this._mergeChild(currIndex, true, false)) {
          currIndex--
        }
      }

      chrRange.start = Math.min(childRange.end, chrRange.end)
      currIndex++
    } // end while(rangeStart < rangeEnd);
  }

  _addLeafRecords (data, chrRange, props) {
    // This function only adds record(s), it won't restructure the tree
    // This function is exactly the same as `OakNode._addLeafRecords`

    // Find the range of child that rangeStart is in
    let currIndex = 0
    props.dataIndex = 0
    let prevDataIndex
    props.continuedList = props.continuedList || []
    if (!(GiveTreeNS.GiveTreeNode.prototype.isPrototypeOf(
      props.LeafNodeCtor.prototype
    ))) {
      throw new Error('LeafNodeCtor `' + props.LeafNodeCtor +
        '` is not a constructor for a tree node!')
    }

    while (this.keys[currIndex + 1] <= chrRange.start) {
      currIndex++
    }

    if (this.keys[currIndex] < chrRange.start) {
      // The new rangeStart appears between windows.
      // Shorten the previous data record by inserting the key,
      // and use this.values[currIndex] to fill the rest
      // (normally it should be `null`)
      this._splitChild(currIndex++, chrRange.start)
    }

    if (this.keys[currIndex + 1] > chrRange.end) {
      // The new rangeEnd appears between windows.
      // Shorten the next data record by inserting the key,
      // and use this.values[currIndex] to fill the current region
      // (normally it should be `null`)
      this._splitChild(currIndex, chrRange.end)
    }

    while (chrRange.start < chrRange.end) {
      while (this.keys[currIndex + 1] <= chrRange.start) {
        currIndex++
      }
      // First get data that should belong to continuedList done.
      prevDataIndex = props.dataIndex
      props.dataIndex = this.constructor._traverseData(data, props.dataIndex,
        dataEntry => dataEntry.start < chrRange.start, props.callback)
      props.continuedList = props.continuedList.concat(
        data.slice(prevDataIndex, props.dataIndex)
      ).filter(entry => entry.end > chrRange.start)

      // Now all data entries with `.start` before `nextRangeStart` should
      // be already in `props.continuedList`

      if (this.keys[currIndex] < chrRange.start) {
        // The new rangeStart appears between windows.
        // Shorten the previous data record by inserting the key,
        // and use `false` to fill the rest
        this._splitChild(currIndex++, chrRange.start, false)
      }

      if (
        props.dataIndex < data.length &&
        data[props.dataIndex].start === this.keys[currIndex]
      ) {
        // there are actual data at this location, create a new leaf node
        this.values[currIndex] = new props.LeafNodeCtor({
          start: this.keys[currIndex]
        })
        this.values[currIndex].insert(data, chrRange, props)
      } else if (this.keys[currIndex] < chrRange.end) {
        // needs to fill the element with `false`, and merge with previous if
        // possible
        this.values[currIndex] = props.continuedList.length <= 0
          ? false : new props.LeafNodeCtor({
            start: this.keys[currIndex],
            continuedList: props.continuedList.slice()
          })
        if (this._mergeChild(currIndex, false, false)) {
          currIndex--
        }
      }

      // Shrink `chrRange` to unprocessed range
      chrRange.start = (
        props.dataIndex < data.length &&
        data[props.dataIndex].start < chrRange.end
      ) ? data[props.dataIndex].start : chrRange.end
    }

    // Process `props.continuedList` for one last time
    props.continuedList = props.continuedList.concat(
      data.slice(prevDataIndex, props.dataIndex)
    ).filter(entry => entry.end > chrRange.end)

    // Remove all processed data from `data`
    data.splice(0, props.dataIndex)
    delete props.dataIndex
  }

  remove (data, exactMatch, convertTo, props) {
    props = props || {}
    // Check whether `this` shall be removed
    if (this.start === data.start && this.end === data.end) {
      if (!exactMatch || this.constructor._compareData(data, this)) {
        // remove content of this
        if (typeof props.callback === 'function') {
          props.callback(this)
        }
        this.clear(convertTo)
        return !!this.isRoot
      }
    }

    // data being remove is not self
    // locate the child entry first
    let i = 0
    while (i < this.values.length && this.keys[i + 1] <= data.start) {
      i++
    }
    if (this.values[i]) {
      // data must fall within `this.values[i]`
      if (!this.values[i].remove(data, exactMatch, convertTo, props)) {
        this.values[i] = convertTo
        this._mergeChild(i, true, false)
      }
    } else {
      logger.warn('Data ' + data + ' is not found in the tree.')
    }
    return (this.values.length > 1 || (
      this.firstChild !== null && this.firstChild !== false
    )) ? this : false
  }

  /**
   * Traverse all nodes / data entries within `this` and calling
   *    functions on them. Pine tree nodes need to implement resolution
   *    support.
   *
   * @param  {ChromRegion} chrRange - the chromosomal range to
   *    traverse.
   * @param  {number} [chrRange.resolution] - the resolution required for
   *    the traverse. 1 is finest. This is used in case of mixed resolutions
   *    for different `chrRange`s, This will override `props.resolution` if
   *    both exist.
   * @param  {function} callback - the callback function, takes a
   *    `ChromRegion` object as its sole parameter and returns
   *    something that can be evaluated as a boolean value to determine
   *    whether the call shall continue (if `breakOnFalse === true`).
   * @param  {function} [filter] - a filter function that takes a
   *    `ChromRegion` object as its sole parameter and returns whether
   *    the region should be included in traverse.
   * @param  {boolean} [breakOnFalse] - whether the traverse should be stopped
   *    if `false` is returned from the callback function.
   * @param  {Object} [props] - additional properties being
   *    passed onto nodes.
   * @param  {boolean} [props.notFirstCall] - whether this is not the first
   *    call of a series of `traverse` calls.
   * @param  {number} [props.resolution] - the resolution required for this
   *    traverse. 1 is finest. This will be overridden by
   *    `chrRange.resolution` if both exist.
   * @returns {boolean} - whether future traverses should be conducted.
   */
  traverse (chrRange, callback, filter, breakOnFalse, props, ...args) {
    if (chrRange) {
      let resolution = chrRange.resolution || props.resolution || 1
      // Rejuvenate `this`
      if (this.start < chrRange.end && this.end > chrRange.start) {
        // Resolution support: check if the resolution is already enough in
        // this node. If so, call `this.constructor._callFuncOnDataEntry` on
        // `this.summaryChromRegion`
        if (this.resolutionEnough(resolution) && this.hasData) {
          // Resolution enough
          return this.constructor._callFuncOnDataEntry(callback, filter,
            breakOnFalse, this.summaryChromRegion, props, ...args
          )
        } else {
          // call `GiveNonLeafNode.prototype.traverse`
          return super.traverse(chrRange, callback, filter, breakOnFalse,
            props, ...args)
        }
      }
    } else { // !chrRange
      throw (new Error(chrRange + ' is not a valid chrRegion.'))
    } // end if(chrRange)
  }

  /**
   * Return an array of chrRegions that does not have
   *    data loaded to allow buffered loading of data.
   *
   * @param  {ChromRegion} chrRange - The range of query.
   * @param  {number} [chrRange.resolution] - the resolution required for the
   *    uncached range. 1 is finest. This is used in case of mixed
   *    resolutions for different `chrRange`s, This will override
   *    `props.resolution` if both exist.
   * @param  {Object} [props] - additional properties being passed onto
   *    nodes
   * @param  {number} [props.resolution] - resolution required for the
   *    query, will be overridden by `chrRange.resolution` if both exist.
   * @param  {number} [props.bufferingRatio] - Ratio of desired
   *    resolution if the data is not available. This would allow a
   *    "resolution buffering" by requesting data at a slightly finer
   *    resolution than currently required.
   * @param  {Array<ChromRegion>} [props._result] - previous unloaded
   *    regions. This will be appended to the front of returned value.
   *    This array will be updated if it gets appended to reduce memory
   *    usage and GC.
   * @returns {Array<ChromRegion>} An ordered array of the regions that
   *    does not have the data at the current resolution requirement.
   *
   *    __Regions will have a `.resolution` property indicating their
   *    intended resolutions. This shall be observed by the server so that
   *    summary of data shall work.__
   *
   *    If no non-data ranges are found, return []
   */
  getUncachedRange (chrRange, props) {
    // return the range list with range(s) without any data
    // if no non-data ranges are found, return []

    let resolution = chrRange.resolution || props.resolution || 1
    props._result = props._result || []
    props.bufferingRatio = props.bufferingRatio || 1
    if (props.bufferingRatio < 1) {
      logger.info(
        'Invalid bufferingRatio: ' + props.bufferingRatio +
        '. Should be greater than 1. Changed to 1 instead.')
      props.bufferingRatio = 1
    }

    if (chrRange) {
      let currIndex = 0
      while (currIndex < this.values.length &&
        this.keys[currIndex + 1] <= chrRange.start
      ) {
        currIndex++
      }
      while (currIndex < this.values.length &&
        this.keys[currIndex] < chrRange.end
      ) {
        if (this.values[currIndex] &&
          !this.childResolutionEnough(resolution, currIndex)
        ) {
          // child has not enough resolution
          this.values[currIndex].getUncachedRange(chrRange, props)
        } else if (!this.childHasData(currIndex)) {
          // either no child at all or child does not have summary data
          // calculate the closest range needed for the resolution
          // first normalize resolution to scalingFactor
          let closestResolution = this._getClosestResolution(
            resolution / props.bufferingRatio)
          let retrieveStart = Math.max(this.keys[currIndex],
            this.constructor.fitResolution(
              chrRange.start, closestResolution, Math.floor))
          let retrieveEnd = Math.min(this.keys[currIndex + 1],
            this.constructor.fitResolution(
              chrRange.end, closestResolution, Math.ceil))
          if (props._result[props._result.length - 1] &&
            props._result[props._result.length - 1].resolution ===
              closestResolution &&
            props._result[props._result.length - 1].end === retrieveStart
          ) {
            props._result[props._result.length - 1].end = retrieveEnd
          } else {
            props._result.push(new ChromRegion({
              chr: chrRange.chr,
              start: retrieveStart,
              end: retrieveEnd,
              resolution: closestResolution
            }))
          }
        }
        currIndex++
      }
      return props._result
    } else { // chrRange
      throw (new Error(chrRange + ' is not a valid chrRegion.'))
    }
  }

  /**
   * Quickly check if the node has any uncached range
   *    within a specific range.
   *
   * @param  {ChromRegion} chrRange - The range of query.
   * @param  {number} [chrRange.resolution] - the resolution required for the
   *    uncached range. 1 is finest. This is used in case of mixed
   *    resolutions for different `chrRange`s, This will override
   *    `props.resolution` if both exist.
   * @param  {Object} [props] - additional properties being passed onto
   *    nodes
   * @param  {number} [props.resolution] - resolution required for the
   *    query, will be overridden by `chrRange.resolution` if both exist.
   * @returns {boolean} `true` if the tree has uncached ranges.
   */
  hasUncachedRange (chrRange, props) {
    // return the range list with range(s) without any data
    // if no non-data ranges are found, return []

    let resolution = chrRange.resolution || props.resolution || 1
    if (chrRange) {
      let currIndex = 0
      while (currIndex < this.values.length &&
        this.keys[currIndex + 1] <= chrRange.start
      ) {
        currIndex++
      }
      while (currIndex < this.values.length &&
        this.keys[currIndex] < chrRange.end
      ) {
        if (this.values[currIndex] &&
          !this.childResolutionEnough(resolution, currIndex)
        ) {
          // child has not enough resolution
          if (this.values[currIndex].hasUncachedRange(chrRange, props)) {
            return true
          }
        } else if (!this.childHasData(currIndex)) {
          return true
        }
        currIndex++
      }
      return false
    } else { // chrRange
      throw (new Error(chrRange + ' is not a valid chrRegion.'))
    }
  }

  /**
   * Whether this node is empty.
   * If there is no child with data, nor is there any summary data, the node is
   * considered empty.
   *
   * @type {boolean}
   */
  get isEmpty () {
    return !this.hasData && super.isEmpty
  }
}

PineNode._DEFAULT_S_FACTOR = 10

module.exports = PineNode
