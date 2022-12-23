export const LOG = (path: string[], ...args: any[]) => {
  const pathText = path
    .map((v, i) => '%c' + new Array(i).fill(' ').join('') + '• %c' + v)
    .join('\n')
  const pathStyles = path
    .map((v, i) => ['', 'background: lightgrey; color: black;'])
    .flat()
  console.log(pathText, ...pathStyles, ...args)
}
export const ERROR = (path: string[], ...args: any[]) => {
  const pathText = path
    .map((v, i) => '%c' + new Array(i).fill(' ').join('') + '• %c' + v)
    .join('\n')
  const pathStyles = path
    .map((v, i) => ['', 'background: lightgrey; color: black;'])
    .flat()
  console.error(pathText, ...pathStyles, ...args)
}

export default { LOG, ERROR }
