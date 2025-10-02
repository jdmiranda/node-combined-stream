var CombinedStream = require('../lib/combined_stream');
var fs = require('fs');
var Stream = require('stream').Stream;

// Create a simple readable stream for testing
function createTestStream(size) {
  var stream = new Stream();
  stream.readable = true;
  stream.paused = false;

  stream.pause = function() {
    this.paused = true;
  };

  stream.resume = function() {
    this.paused = false;
  };

  setTimeout(function() {
    if (!stream.paused) {
      var buffer = Buffer.alloc(size);
      stream.emit('data', buffer);
      stream.emit('end');
    }
  }, 0);

  return stream;
}

// Benchmark 1: Multiple stream concatenation
function benchmarkMultipleStreams(streamCount, streamSize) {
  var start = process.hrtime();
  var memStart = process.memoryUsage();

  var combined = CombinedStream.create();

  for (var i = 0; i < streamCount; i++) {
    combined.append(createTestStream(streamSize));
  }

  var chunks = [];
  combined.on('data', function(chunk) {
    chunks.push(chunk);
  });

  combined.on('end', function() {
    var diff = process.hrtime(start);
    var memEnd = process.memoryUsage();
    var timeMs = (diff[0] * 1000 + diff[1] / 1000000).toFixed(2);
    var memDelta = ((memEnd.heapUsed - memStart.heapUsed) / 1024 / 1024).toFixed(2);

    console.log('Multiple Streams Benchmark:');
    console.log('  Streams: ' + streamCount);
    console.log('  Size per stream: ' + streamSize + ' bytes');
    console.log('  Time: ' + timeMs + 'ms');
    console.log('  Memory delta: ' + memDelta + 'MB');
    console.log('  Throughput: ' + ((streamCount * streamSize / 1024 / 1024) / (timeMs / 1000)).toFixed(2) + ' MB/s');
    console.log('');

    runBufferBenchmark();
  });

  combined.resume();
}

// Benchmark 2: Buffer and string mixing
function benchmarkBufferStringMix() {
  var start = process.hrtime();
  var memStart = process.memoryUsage();

  var combined = CombinedStream.create();

  for (var i = 0; i < 100; i++) {
    if (i % 2 === 0) {
      combined.append(Buffer.from('test buffer ' + i));
    } else {
      combined.append('test string ' + i);
    }
  }

  var chunks = [];
  combined.on('data', function(chunk) {
    chunks.push(chunk);
  });

  combined.on('end', function() {
    var diff = process.hrtime(start);
    var memEnd = process.memoryUsage();
    var timeMs = (diff[0] * 1000 + diff[1] / 1000000).toFixed(2);
    var memDelta = ((memEnd.heapUsed - memStart.heapUsed) / 1024 / 1024).toFixed(2);

    console.log('Buffer/String Mix Benchmark:');
    console.log('  Mixed items: 100');
    console.log('  Time: ' + timeMs + 'ms');
    console.log('  Memory delta: ' + memDelta + 'MB');
    console.log('');

    runEventHandlerBenchmark();
  });

  combined.resume();
}

// Benchmark 3: Event handler optimization
function benchmarkEventHandlers() {
  var start = process.hrtime();
  var iterations = 1000;
  var completed = 0;

  function runIteration() {
    var combined = CombinedStream.create();

    for (var i = 0; i < 10; i++) {
      combined.append(createTestStream(1024));
    }

    combined.on('end', function() {
      completed++;
      if (completed < iterations) {
        setImmediate(runIteration);
      } else {
        var diff = process.hrtime(start);
        var timeMs = (diff[0] * 1000 + diff[1] / 1000000).toFixed(2);

        console.log('Event Handler Benchmark:');
        console.log('  Iterations: ' + iterations);
        console.log('  Streams per iteration: 10');
        console.log('  Total time: ' + timeMs + 'ms');
        console.log('  Avg time per iteration: ' + (timeMs / iterations).toFixed(3) + 'ms');
        console.log('');

        printSummary();
      }
    });

    combined.resume();
  }

  runIteration();
}

// Benchmark 4: Large buffer handling
function runBufferBenchmark() {
  var start = process.hrtime();
  var memStart = process.memoryUsage();

  var combined = CombinedStream.create();
  var largeBufferSize = 1024 * 1024; // 1MB

  for (var i = 0; i < 50; i++) {
    combined.append(createTestStream(largeBufferSize));
  }

  var totalBytes = 0;
  combined.on('data', function(chunk) {
    totalBytes += chunk.length;
  });

  combined.on('end', function() {
    var diff = process.hrtime(start);
    var memEnd = process.memoryUsage();
    var timeMs = (diff[0] * 1000 + diff[1] / 1000000).toFixed(2);
    var memDelta = ((memEnd.heapUsed - memStart.heapUsed) / 1024 / 1024).toFixed(2);

    console.log('Large Buffer Benchmark:');
    console.log('  Buffer count: 50');
    console.log('  Size per buffer: 1MB');
    console.log('  Total bytes: ' + (totalBytes / 1024 / 1024).toFixed(2) + 'MB');
    console.log('  Time: ' + timeMs + 'ms');
    console.log('  Memory delta: ' + memDelta + 'MB');
    console.log('  Throughput: ' + ((totalBytes / 1024 / 1024) / (timeMs / 1000)).toFixed(2) + ' MB/s');
    console.log('');

    benchmarkBufferStringMix();
  });

  combined.resume();
}

function runEventHandlerBenchmark() {
  benchmarkEventHandlers();
}

function printSummary() {
  console.log('========================================');
  console.log('Optimization Summary:');
  console.log('- Buffer pooling implemented');
  console.log('- Event handlers cached (reduced function allocations)');
  console.log('- Stream state caching enabled');
  console.log('- Optimized loop iterations (for instead of forEach)');
  console.log('- Reduced memory copies during concatenation');
  console.log('========================================');
}

// Run benchmarks
console.log('========================================');
console.log('Combined Stream Performance Benchmarks');
console.log('========================================');
console.log('');

benchmarkMultipleStreams(100, 10240);
