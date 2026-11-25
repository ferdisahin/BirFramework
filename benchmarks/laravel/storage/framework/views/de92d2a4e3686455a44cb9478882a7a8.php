<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Laravel SSR Benchmark</title>
</head>
<body>
  <h1>Welcome to Laravel SSR</h1>
  <ul>
    <?php $__currentLoopData = $users; $__env->addLoop($__currentLoopData); foreach($__currentLoopData as $u): $__env->incrementLoopIndices(); $loop = $__env->getLastLoop(); ?>
      <li><?php echo e($u['name']); ?> (<?php echo e($u['email']); ?>)</li>
    <?php endforeach; $__env->popLoop(); $loop = $__env->getLastLoop(); ?>
  </ul>
</body>
</html>
<?php /**PATH /Users/ferdisahin/Developer/BirFramework/benchmarks/laravel/resources/views/bench.blade.php ENDPATH**/ ?>