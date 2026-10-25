# render.sh in.svg size out.png
f=$(mktemp --suffix=.html); echo "<html><body style='margin:0;background:transparent'><img src='file://$PWD/$1' width=$2 height=$2 style='display:block'></body></html>" > $f
google-chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars --default-background-color=00000000 --window-size=$2,$2 --screenshot=$PWD/$3 file://$f 2>/dev/null >/dev/null; rm $f
