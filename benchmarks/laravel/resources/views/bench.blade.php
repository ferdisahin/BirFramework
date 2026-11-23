<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Laravel SSR Benchmark</title>
</head>
<body>
  <h1>Welcome to Laravel SSR</h1>
  <ul>
    @foreach($users as $u)
      <li>{{ $u['name'] }} ({{ $u['email'] }})</li>
    @endforeach
  </ul>
</body>
</html>
