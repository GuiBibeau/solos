// @ts-check

/** @param {string} value */
const quote = (value) => `'${value.replaceAll("'", String.raw`'\''`)}'`;

/**
 * A failed prewarm leaves its filesystem behind. Refresh a retained checkout before retrying
 * setup so the template uses the latest setup script; never erase an unrelated or dirty tree.
 * Production supplies the literal configured remote and the fixed station checkout directory.
 * @param {{ directory: string; url: string }} options
 */
export const prepareRepositoryCommand = ({ directory, url }) => {
  const target = quote(directory);
  const remote = quote(url);
  return `set -eu
if [ -d ${target}/.git ]; then
  if [ "$(git -C ${target} remote get-url origin)" != ${remote} ]; then
    echo 'factory checkout belongs to a different repository; refusing to replace it' >&2
    exit 1
  fi
  git -C ${target} diff --quiet
  git -C ${target} diff --cached --quiet
  git -C ${target} fetch --depth 50 ${remote} HEAD
  git -C ${target} checkout --detach FETCH_HEAD
else
  mkdir -p ${target}
  git clone --depth 50 ${remote} ${target}
fi`;
};
