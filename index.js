const FS = require("fs");
const Path = require("path");

const { pathToFileURL } = require("url");

const { compileString, Logger } = require("sass");

/**
 * @type {(options:{
 *  theme: string;
 *  options?: {
 *    prefixCls?: string;
 *    variables?: {[key: string]: string | number};
 *    include?: string;
 *    cssLayer?: boolean;
 *  };
 * })=>any}
 *
 * @note 阅读 webpack 版本代码的理解
 * 1. 解析 css 到对应 scss
 * 2. 替换 scss 内容
 * 3. 再构建成对应的 css
 */
module.exports = function ({ theme, options = {} }) {
  return {
    name: "semi-theme",
    enforce: "post",
    load(id) {
      let filePath = normalizePath(id);
      if (options.include){
        options.include = normalizePath(options.include);
      }
      // https://github.com/DouyinFE/semi-design/blob/main/packages/semi-webpack/src/semi-webpack-plugin.ts#L83
      if (
        /@douyinfe\/semi-(ui|icons|foundation)\/lib\/.+\.css$/.test(filePath)
      ) {
        let scssFilePath = filePath.replace(/\.css$/, ".scss");

        // 目前只有 name
        // https://github.com/DouyinFE/semi-design/blob/04d17a72846dfb5452801a556b6e01f9b0e8eb9d/packages/semi-webpack/src/semi-webpack-plugin.ts#L23
        let semiSemiLoaderOptions = { name: theme };

        return compileString(
          // TODO (boen): 未解析 file query
          loader(FS.readFileSync(scssFilePath), {
            ...semiSemiLoaderOptions,
            ...options,
            variables: convertMapToString(options.variables || {}),
          }),
          {
            importers: [
              {
                findFileUrl(url) {
                  if (url.startsWith("~")) {
                    return new URL(
                      url.substring(1),
                      pathToFileURL(
                        scssFilePath.match(/^(\S*\/node_modules\/)/)[0]
                      )
                    );
                  }

                  let filePath = Path.resolve(Path.dirname(scssFilePath), url);

                  if (FS.existsSync(filePath)) {
                    return pathToFileURL(filePath);
                  }

                  return null;
                },
              },
            ],
            logger: Logger.silent,
          }
        ).css;
      }
    },
  };
};

// copy from https://github.com/DouyinFE/semi-design/blob/main/packages/semi-webpack/src/semi-theme-loader.ts
function loader(source, options) {
  let fileStr = source.toString("utf8");

  const cssLayer = options.cssLayer ?? false;

  const theme = options.name || "@douyinfe/semi-theme-default";
  // always inject
  const scssVarStr = `@import "~${theme}/scss/index.scss";\n`;
  // inject once
  const cssVarStr = `@import "~${theme}/scss/global.scss";\n`;
  // [vite-plugin]: sync from https://github.com/DouyinFE/semi-design/commit/a6064489a683495a737cbe7abd72c0b49a3bcd06
  let animationStr = `@import "~${theme}/scss/animation.scss";\n`;

  try {
    require.resolve(`${theme}/scss/animation.scss`);
  } catch (e) {
    animationStr = ""; // fallback to empty string
  }

  const shouldInject = fileStr.includes("semi-base");

  let componentVariables;

  try {
    componentVariables = require.resolve(`${theme}/scss/local.scss`);
  } catch (e) {}

  if (options.include || options.variables || componentVariables) {
    let localImport = "";
    if (componentVariables) {
      localImport += `\n@import "~${theme}/scss/local.scss";`;
    }
    if (options.include) {
      localImport += `\n@import "${options.include}";`;
    }
    if (options.variables) {
      localImport += `\n${options.variables}`;
    }
    try {
      const regex =
        /(@import '.\/variables.scss';?|@import ".\/variables.scss";?)/g;
      const fileSplit = fileStr.split(regex).filter((item) => Boolean(item));
      if (fileSplit.length > 1) {
        fileSplit.splice(fileSplit.length - 1, 0, localImport);
        fileStr = fileSplit.join("");
      }
    } catch (error) {}
  }

  // inject prefix
  const prefixCls = options.prefixCls || "semi";

  const prefixClsStr = `$prefix: '${prefixCls}';\n`;

  let finalCSS = '';

  if (shouldInject) {
    finalCSS = `${animationStr}${cssVarStr}${scssVarStr}${prefixClsStr}${fileStr}`;
  } else {
    finalCSS = `${scssVarStr}${prefixClsStr}${fileStr}`;
  }

  if (cssLayer) {
    finalCSS = `@layer semi{${finalCSS}}`;
  }

  return finalCSS;
}

// copy from https://github.com/DouyinFE/semi-design/blob/main/packages/semi-webpack/src/semi-webpack-plugin.ts#L136
function convertMapToString(map) {
  return Object.keys(map).reduce(function (prev, curr) {
    return prev + `${curr}: ${map[curr]};\n`;
  }, "");
}

function normalizePath(id) {
  return Path.posix.normalize(
    require("os").platform() === "win32" ? id.replace(/\\/g, "/") : id
  );
}
