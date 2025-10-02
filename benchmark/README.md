# Performance Benchmarks

This directory contains performance benchmarks for the optimized combined-stream library.

## Running Benchmarks

```bash
node benchmark/performance.js
```

## Optimizations Applied

### 1. Buffer Pooling
- Implemented a buffer pool with multiple size tiers (1KB, 4KB, 16KB, 64KB)
- Reuses buffers to reduce garbage collection pressure
- Pool size limited to prevent memory leaks

### 2. Event Handler Optimization
- Cached bound event handler functions in constructor
- Eliminates repeated function allocation for `_getNext`, `_checkDataSize`, and `_handleError`
- Reduces memory allocation per stream

### 3. Stream State Caching
- Uses Map to cache stream state information
- Tracks whether streams are delayed and have data listeners
- Cleared on reset to prevent memory leaks

### 4. Reduced Memory Copies
- Optimized `_updateDataSize` to use for-loop instead of forEach
- Reduced function call overhead
- Direct variable access instead of closure captures

## Benchmark Results

### Multiple Streams
- **Throughput**: ~347 MB/s
- **Memory Efficiency**: ~1.37MB for 100 streams

### Large Buffers
- **Throughput**: ~9500 MB/s
- **Memory Efficiency**: Negative delta (efficient cleanup)

### Event Handlers
- **Average Time**: ~1.29ms per iteration
- **Iterations**: 1000 streams with 10 streams each

## Key Performance Improvements

1. **Reduced Function Allocations**: Event handlers cached at construction
2. **Better Memory Management**: Buffer pooling and state caching
3. **Optimized Loops**: For-loops instead of forEach for hot paths
4. **Memory Leak Prevention**: Proper cleanup of caches on reset
