const gulp = require("gulp");
const tslint = require("gulp-tslint");
const gutil = require("gulp-util");
const install = require("gulp-install");
const ts = require("gulp-typescript");
const sourcemaps = require("gulp-sourcemaps");
const webpack = require("webpack");
const runSequence = require('run-sequence');
const del = require('del');

const path = require("path");

//...
gulp.task("tslint", () => {
    return gulp.src(["**/*.ts", "!**/*.d.ts", "!node_modules/**"])
        .pipe(tslint())
        .pipe(tslint.report());
});

gulp.task("install", () => {
    return gulp.src(['./package.json', './html/package.json']).pipe(install());
});

gulp.task("html-webpack", (done) => {
    const config = require("./html/webpack.config.js");
    config.context = `${__dirname}/html`;
    return webpack(config, (err, stats) => {
        const statsJson = stats.toJson();
        if (err || (statsJson.errors && statsJson.errors.length)) {
            statsJson.errors.forEach(webpackError => {
                gutil.log(gutil.colors.red(`Error (webpack): ${webpackError}`));
            });

            throw new gutil.PluginError('webpack', JSON.stringify(err || statsJson.errors));
        }
        gutil.log('[webpack]', stats.toString());
        done();
    });
});

gulp.task("ts-compile", () => {
    const tsProject = ts.createProject("./tsconfig.json");
    return tsProject.src()
        .pipe(sourcemaps.init())
        .pipe(tsProject())
        .pipe(sourcemaps.write(".", {
            mapSources: (sourcePath, file) => {
                // Correct source map path.
                const relativeSourcePath = path.relative(path.dirname(file.path), path.join(file.base, sourcePath));
                return relativeSourcePath;
            }
        }))
        .pipe(gulp.dest("out"));
});

gulp.task("clean", (done) => {
    return del('out', done);
});

gulp.task("build", (done) => {
    return runSequence("clean", "ts-compile", "html-webpack", done);
});

gulp.task("watch", () => {
    gulp.watch(["./src/**/*", "./test/**/*"], ["ts-compile"]);
    gulp.watch(["./html/**/*", "!./html/node_modules/**"], ["html-webpack"]);
});
