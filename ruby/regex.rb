# regex for named captures

def regex
  # pre, inter, regnum, post
  # regnum, though captured, isn't used because a new regnum takes its place.
  /(?<pre>^.*?)on.call(?<inter>[^<]*)(?<regnum><@\w*>)(?<post>.*)$/i
end
