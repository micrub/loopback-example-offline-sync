var gulp = require('gulp');
var nodemon = require('gulp-nodemon');
var sh = require('shelljs');
var async = require('async');
var path = require('path');
var fs = require('fs');
var currentEnv = process.env.NODE_ENV || 'development';
var config = {
  global: {},
  local: {},
  build: {}
};
var webProcess;

// add the current directory to the NODE_PATH
process.env.NODE_PATH = __dirname + ':' + process.env.NODE_PATH;

// run the entire project
gulp.task('run', function(cb) {
  nodemon({
      script: 'web/app.js',
      ext: 'html js ejs json',
      ignore: [
        '**/node_modules/**',
        '*/build/**',
        '**/test/**',
        '**/*.bundle.*',
        '.*' // .git, .idea, etc.
      ],
      watch: __dirname,
      cwd: __dirname,
      env: {NODE_PATH: process.env.NODE_PATH},
      nodeArgs: ['--debug']
    })
    .on('change', function() {
      // TODO(ritch) only build the package that changed
      findAndBuild('*', function(err) {
        cb(err);
      });
    })
    .on('restart', function () {
      console.log('restarted!');
    });
});

// build a package
gulp.task('build', function(cb) {
  findAndBuild('*', cb);
});

// default task (for dev)
gulp.task('default', ['build', 'run']);

function findAndBuild(packageName, cb) {
  var packages = findPackages(packageName);
  // clean
  // packages.forEach(clean);

  // configure all globally
  packages.forEach(globalConfigure);

  // configure locally
  packages.forEach(localConfigure);

  // write local config modules
  packages.forEach(writeLocalConfigModule);

  // write global config module
  writeGlobalConfigModule();

  // build each
  async.eachSeries(packages, build, cb);
}

var packageCache;

function findPackages(packageName) {
  var matchAll = packageName === '*' || !packageName;
  var packages = packageCache || (packageCache = listPackages());

  return packages.filter(function(directoryName) {
    if(matchAll) {
      return true;
    } else if(directoryName === packageName) {
      return true;
    }
    return false;
  });
}

function listPackages() {
  return sh
    .find(__dirname)
    .filter(function(filePath) {
      return path.dirname(path.dirname(filePath)) === __dirname
             && path.dirname(filePath) !== __dirname
             && path.basename(filePath) === 'configure.js'
    })
    .map(function(filePath) {
      return path.basename(path.dirname(filePath));
    })
    .sort(function(a, b) {
      // temporary hack - ensure lbclient is built before html5
      if (a === 'lbclient') return -1;
      if (b === 'lbclient') return 1;
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    });
}

function build(package, cb) {
  console.log('building', package);
  configure(package, 'build', function(err) {
    if (err) {
      console.error('%s build failed', package, err.stack);
    } else {
      console.log('%s was built', package);
    }
    cb(err);
  });
}

function configure(package, scope, cb) {
  var configurePackage = packageScript(package, 'configure');
  var localConfig = config.local[package] || (config.local[package] = {});
  var globalConfig = config.global;

  if(configurePackage && configurePackage[scope]) {
    configurePackage[scope](currentEnv, globalConfig, localConfig, cb);
  } else if(cb) {
    cb();
  }
}

function globalConfigure(package) {
  configure(package, 'global');
}

function localConfigure(package) {
  configure(package, 'local');
}

function clean(package) {
  removeConfigModule(package);
}

function packageScript(package, name) {
  var file = path.join(__dirname, package, name + '.js');
  if(fs.existsSync(file)) {
    return require(file);
  }
}

function writeLocalConfigModule(package) {
  var localConfig = config.local[package];
  writeConfigModule(path.join(__dirname, package), 'local.config.js', localConfig);
}

function writeGlobalConfigModule() {
  writeConfigModule(__dirname, 'global.config.js', config.global);
}

function writeConfigModule(root, name, obj) {
  var type = ~name.indexOf('global') ? 'GLOBAL' : 'LOCAL';
  sh.mkdir('-p', path.join(root, 'node_modules'));
  var src = 'module.exports = process.' + type + '_CONFIG = ' + JSON.stringify(obj);
  src.to(path.join(root, 'node_modules', name));
}

function removeConfigModule(package) {
  fs.unlinkSync(path.join(__dirname, package, 'node_modules', 'local.config.js'));
}
