;; Statistics over arrays of f64 in linear memory, for percentile-heavy vitals aggregation.
;; The host writes `len` values at byte offset `ptr` (8-byte aligned), then calls:
;;   sort(ptr, len)              in-place ascending heap sort, O(n log n), no recursion
;;   percentile(ptr, len, p)     nearest-rank percentile of a SORTED array (p in 0..100)
;;   mean(ptr, len)              arithmetic mean
;;   variance(ptr, len)          sample variance (n - 1)
;; Build: node scripts/build-wasm.mjs (wat -> wasm -> src/vitals-wasm.generated.ts)
(module
  (memory (export "memory") 1)

  (func $addr (param $ptr i32) (param $i i32) (result i32)
    (i32.add (local.get $ptr) (i32.shl (local.get $i) (i32.const 3))))

  (func $swap (param $ptr i32) (param $i i32) (param $j i32)
    (local $a i32) (local $b i32) (local $t f64)
    (local.set $a (call $addr (local.get $ptr) (local.get $i)))
    (local.set $b (call $addr (local.get $ptr) (local.get $j)))
    (local.set $t (f64.load (local.get $a)))
    (f64.store (local.get $a) (f64.load (local.get $b)))
    (f64.store (local.get $b) (local.get $t)))

  ;; restores the max-heap property below `root` within [0, end)
  (func $siftDown (param $ptr i32) (param $root i32) (param $end i32)
    (local $child i32) (local $swapIdx i32)
    (block $done
      (loop $next
        (local.set $child (i32.add (i32.shl (local.get $root) (i32.const 1)) (i32.const 1)))
        (br_if $done (i32.ge_s (local.get $child) (local.get $end)))
        (local.set $swapIdx (local.get $root))
        (if (f64.lt (f64.load (call $addr (local.get $ptr) (local.get $swapIdx)))
                    (f64.load (call $addr (local.get $ptr) (local.get $child))))
          (then (local.set $swapIdx (local.get $child))))
        (if (i32.lt_s (i32.add (local.get $child) (i32.const 1)) (local.get $end))
          (then
            (if (f64.lt (f64.load (call $addr (local.get $ptr) (local.get $swapIdx)))
                        (f64.load (call $addr (local.get $ptr) (i32.add (local.get $child) (i32.const 1)))))
              (then (local.set $swapIdx (i32.add (local.get $child) (i32.const 1)))))))
        (br_if $done (i32.eq (local.get $swapIdx) (local.get $root)))
        (call $swap (local.get $ptr) (local.get $root) (local.get $swapIdx))
        (local.set $root (local.get $swapIdx))
        (br $next))))

  (func (export "sort") (param $ptr i32) (param $len i32)
    (local $i i32) (local $end i32)
    (if (i32.lt_s (local.get $len) (i32.const 2)) (then (return)))
    ;; heapify
    (local.set $i (i32.sub (i32.div_s (local.get $len) (i32.const 2)) (i32.const 1)))
    (block $built
      (loop $heapify
        (call $siftDown (local.get $ptr) (local.get $i) (local.get $len))
        (br_if $built (i32.eqz (local.get $i)))
        (local.set $i (i32.sub (local.get $i) (i32.const 1)))
        (br $heapify)))
    ;; repeatedly move the max to the end
    (local.set $end (i32.sub (local.get $len) (i32.const 1)))
    (block $sorted
      (loop $extract
        (br_if $sorted (i32.le_s (local.get $end) (i32.const 0)))
        (call $swap (local.get $ptr) (i32.const 0) (local.get $end))
        (call $siftDown (local.get $ptr) (i32.const 0) (local.get $end))
        (local.set $end (i32.sub (local.get $end) (i32.const 1)))
        (br $extract))))

  (func (export "percentile") (param $ptr i32) (param $len i32) (param $p f64) (result f64)
    (local $rank i32)
    (if (i32.eqz (local.get $len)) (then (return (f64.const nan))))
    ;; nearest rank: ceil(p/100 * n), clamped to [1, n]
    (local.set $rank (i32.trunc_f64_s (f64.ceil (f64.mul (f64.div (local.get $p) (f64.const 100)) (f64.convert_i32_s (local.get $len))))))
    (if (i32.lt_s (local.get $rank) (i32.const 1)) (then (local.set $rank (i32.const 1))))
    (if (i32.gt_s (local.get $rank) (local.get $len)) (then (local.set $rank (local.get $len))))
    (f64.load (call $addr (local.get $ptr) (i32.sub (local.get $rank) (i32.const 1)))))

  (func $sum (param $ptr i32) (param $len i32) (result f64)
    (local $i i32) (local $acc f64)
    (block $end
      (loop $next
        (br_if $end (i32.ge_s (local.get $i) (local.get $len)))
        (local.set $acc (f64.add (local.get $acc) (f64.load (call $addr (local.get $ptr) (local.get $i)))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $next)))
    (local.get $acc))

  (func $mean (export "mean") (param $ptr i32) (param $len i32) (result f64)
    (if (i32.eqz (local.get $len)) (then (return (f64.const nan))))
    (f64.div (call $sum (local.get $ptr) (local.get $len)) (f64.convert_i32_s (local.get $len))))

  (func (export "variance") (param $ptr i32) (param $len i32) (result f64)
    (local $i i32) (local $m f64) (local $d f64) (local $acc f64)
    (if (i32.lt_s (local.get $len) (i32.const 2)) (then (return (f64.const 0))))
    (local.set $m (call $mean (local.get $ptr) (local.get $len)))
    (block $end
      (loop $next
        (br_if $end (i32.ge_s (local.get $i) (local.get $len)))
        (local.set $d (f64.sub (f64.load (call $addr (local.get $ptr) (local.get $i))) (local.get $m)))
        (local.set $acc (f64.add (local.get $acc) (f64.mul (local.get $d) (local.get $d))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $next)))
    (f64.div (local.get $acc) (f64.convert_i32_s (i32.sub (local.get $len) (i32.const 1))))))
