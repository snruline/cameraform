Pod::Spec.new do |s|
  s.name             = 'ExifReader'
  s.version          = '1.0.0'
  s.summary          = 'Native EXIF GPS reader for CAMERAFORM (iOS via ImageIO + Photos)'
  s.description      = <<-DESC
                       Reads EXIF GPS coordinates and DateTimeOriginal from image files.
                       Bypasses JS-side limitations when iOS or Android picker strips
                       metadata. Used in CAMERAFORM Map upload feature.
                       DESC
  s.homepage         = 'https://github.com/snruline/cameraform'
  s.license          = { :type => 'Proprietary', :text => 'Internal use only.' }
  s.author           = 'CAMERAFORM Team'
  s.source           = { :path => '.' }

  s.ios.deployment_target = '13.0'
  s.source_files = '*.{h,m}'
  s.requires_arc = true

  s.frameworks = 'ImageIO', 'Photos'

  # React-Core เป็น dependency มาตรฐานของ native module
  s.dependency 'React-Core'
end
