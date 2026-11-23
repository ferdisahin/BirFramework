<?php

use Illuminate\Support\Facades\Route;

Route::get('/api/bench', function () {
    return response()->json([
        'message' => 'Hello World from Laravel Benchmark',
        'framework' => 'Laravel',
        'timestamp' => round(microtime(true) * 1000),
    ]);
});

Route::get('/', function () {
    return view('bench', [
        'users' => [
            ['id' => 1, 'name' => 'Alice', 'email' => 'alice@example.com'],
            ['id' => 2, 'name' => 'Bob', 'email' => 'bob@example.com'],
            ['id' => 3, 'name' => 'Charlie', 'email' => 'charlie@example.com'],
        ]
    ]);
});
