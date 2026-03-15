# Rust PVM Contract Rules

- Must be `#![no_std]` — no standard library
- Use `extern crate alloc` for Vec, String, etc.
- All public functions must have doc comments (///)
- No `unwrap()` or `expect()` — handle all errors gracefully
- Use u128 for all price/amount values (matches Solidity uint256 scaled down)
- Overflow-safe arithmetic: use checked_add, checked_mul, saturating_add where needed
- Sort algorithms must be stable (maintain insertion order for equal elements)
- Every public function needs at least 3 unit tests: happy path, edge case, empty input
