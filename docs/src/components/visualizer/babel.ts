export const addHooksWrapper = (babel: any) => {
  const { types: t } = babel;

  return {
    name: 'add-hook-wrapper',
    visitor: {
      VariableDeclarator(path: any) {
        // Check if it's a const declaration
        if (!(path.parent.kind === 'const')) return;

        // Check if identifier starts with 'use' followed by uppercase letter
        const name = path.node.id.name;
        if (!/^use[A-Z]/.test(name)) return;

        // Check if it's an arrow function
        const init = path.node.init;
        if (!t.isArrowFunctionExpression(init)) return;

        // Create the hook wrapper
        path.node.init = t.callExpression(t.identifier('hook'), [
          init,
          t.objectExpression([
            t.objectProperty(t.identifier('desc'), t.stringLiteral(name)),
          ]),
        ]);
      },
    },
  };
};

export const addDescOptions = (babel: any) => {
  const { types: t } = babel;

  return {
    name: 'add-desc-options',
    visitor: {
      CallExpression(path: any) {
        // Check if it's a call to computed or subscription
        if (
          t.isIdentifier(path.node.callee) &&
          (path.node.callee.name === 'computed' ||
            path.node.callee.name === 'asyncComputed' ||
            path.node.callee.name === 'subscription')
        ) {
          // Get the function name from the variable declaration
          let functionName = '';
          if (path.parent && t.isVariableDeclarator(path.parent)) {
            functionName = path.parent.id.name;
          }

          // If there's already an options object
          if (
            path.node.arguments.length > 1 &&
            t.isObjectExpression(path.node.arguments[1])
          ) {
            // Add desc property to existing options object
            path.node.arguments[1].properties.push(
              t.objectProperty(
                t.identifier('desc'),
                t.stringLiteral(functionName),
              ),
            );
          } else {
            // Add new options object with desc
            path.node.arguments.push(
              t.objectExpression([
                t.objectProperty(
                  t.identifier('desc'),
                  t.stringLiteral(functionName),
                ),
              ]),
            );
          }
        }
      },
    },
  };
};
